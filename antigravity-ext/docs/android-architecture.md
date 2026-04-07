# Antigravity Android — Companion App アーキテクチャ設計

> 方針: 全面移植ではなく **OS連携だけをネイティブ化**
> Web/PWA 側（編集・検証・重い画面）は残す。Android 側は同期・通知・ウィジェット・簡易ダッシュボード・クイックアクションを担う。

---

## 1. 責務分担

| レイヤー | 担う機能 | 技術スタック |
|---|---|---|
| **Web / Chrome拡張** | 資産設定・詳細入力・ジャーナル・バックテスト | 既存 React + TypeScript |
| **Android Companion** | 定期同期・通知・ウィジェット・簡易ダッシュボード | Kotlin + Jetpack |

Android は **「表示とOS連携」** に徹する。判定ロジックは既存仕様を踏襲した Kotlin 再実装。

---

## 2. 共通契約（core-contract）

以下の型・仕様を **Web/Android 共通の契約** として固定する。
Android 側では Kotlin で薄く再実装し、ロジックの意味を揃える。

### 型定義

```kotlin
// QuoteSnapshot
data class QuoteSnapshot(
    val assetId: String,
    val assetClass: AssetClass,         // JP_STOCK | JP_ETF | JP_REIT | MUTUAL_FUND
    val quoteKind: QuoteKind,           // INTRADAY | CLOSE | NAV | REFERENCE
    val value: Double,
    val currency: String,
    val baselineDate: String,           // "yyyy-MM-dd" JST
    val marketDataAt: String?,          // ISO-8601 JST, 成立時刻
    val syncedAt: String,               // ISO-8601 JST, 取得時刻
    val ticker: String?,
    val name: String?,
)

// FreshnessView
data class FreshnessView(
    val level: FreshnessLevel,          // FRESH | LAGGING | STALE | UNKNOWN
    val canPretendCurrent: Boolean,     // true = "現在値" 表示可
    val priceLabel: String,             // "現在値" | "終値" | "基準価額" | etc.
    val asOfLabel: String,
    val isStale: Boolean,
    val reason: String?,
    val message: String?,
)

// SnapshotFetchState
data class SnapshotFetchState(
    val status: FetchStatus,            // IDLE | SUCCESS | FAILED
    val errorKind: FetchErrorKind?,
    val errorMessage: String?,
    val fallbackUsed: Boolean,
    val lastAttemptAt: String?,
    val lastSuccessAt: String?,
    val lastErrorAt: String?,
)
```

### 不変条件（Web と完全に同一）

```
- canPretendCurrent = true  →  fresh intraday (marketDataAt が 20 分以内) のみ
- fetch 失敗時に price state を書き換えない
- status=idle / success → 状態行なし
- status=failed のみ → 状態行あり
```

---

## 3. データフロー

```
WorkManager (定期 / one-time)
  └─ fetchMarketSnapshot()          # HTTP → antigravity-server
       ├─ 成功 → snapshotToQuoteSnapshots()
       │          └─ Room に保存 (quote_snapshots)
       │          └─ FetchStatus を IDLE→SUCCESS に更新
       │          └─ evaluateFreshness()
       │          └─ 通知トリガー / Widget 更新
       └─ 失敗 → FetchStatus を FAILED に更新
                 └─ price state は一切書き換えない（縮退ルール）
                 └─ 通知 / Widget は既存キャッシュを使い続ける
```

Web 側パイプラインと **概念が揃っている** ことを優先する。

---

## 4. モジュール設計

```
android/
├── core-contract/          # 型定義・enum・不変条件
│   ├── QuoteSnapshot.kt
│   ├── FreshnessView.kt
│   ├── SnapshotFetchState.kt
│   └── Enums.kt
│
├── core-engine/            # 純粋関数 (ロジック移植)
│   ├── FreshnessEvaluator.kt    # evaluateFreshness 相当
│   ├── SummaryTextBuilder.kt    # generateSummaryText 相当
│   └── CandidateReasonText.kt   # buildCandidateReasonText 相当
│
├── data/                   # fetch / adapter / Room
│   ├── SnapshotFetcher.kt
│   ├── SnapshotAdapter.kt       # snapshotToQuoteSnapshots 相当
│   ├── room/
│   │   ├── QuoteSnapshotDao.kt
│   │   ├── FetchStatusDao.kt
│   │   └── AppDatabase.kt
│   └── datastore/
│       └── UserPrefsDataStore.kt
│
├── feature-home/           # Compose ダッシュボード
│   ├── HomeScreen.kt
│   ├── HomeViewModel.kt
│   └── PriceCard.kt
│
└── feature-widget-notification/
    ├── SyncWorker.kt            # WorkManager
    ├── NotificationManager.kt
    └── PriceWidget.kt           # Glance
```

---

## 5. バックグラウンド同期（WorkManager）

```kotlin
// SyncWorker
class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        return try {
            val snapshot = fetcher.fetchMarketSnapshot()
            val quotes = adapter.toQuoteSnapshots(snapshot)
            if (quotes.isEmpty()) {
                statusDao.save(FetchStatus.FAILED(errorKind = EMPTY_SNAPSHOT))
                return Result.success()  // retry 不要
            }
            quoteDao.upsertAll(quotes)
            statusDao.save(FetchStatus.SUCCESS)
            triggerNotificationIfNeeded()
            updateWidget()
            Result.success()
        } catch (e: IOException) {
            statusDao.save(FetchStatus.FAILED(errorKind = NETWORK))
            Result.retry()
        } catch (e: TimeoutException) {
            statusDao.save(FetchStatus.FAILED(errorKind = TIMEOUT))
            Result.retry()
        }
    }
}

// 登録
WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
    "antigravity_sync",
    ExistingPeriodicWorkPolicy.KEEP,
    PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
        .setConstraints(Constraints(requiredNetworkType = NetworkType.CONNECTED))
        .build()
)
```

**トリガー種別:**

| 種別 | 実装 | 間隔 |
|---|---|---|
| 定期同期 | `PeriodicWorkRequest` | 15 分（Android 最小） |
| 起動時即時 | `OneTimeWorkRequest` | アプリ起動 |
| 手動更新 | `OneTimeWorkRequest` | UI ボタン押下 |
| 失敗時リトライ | `Result.retry()` + BackoffPolicy | 自動 |

Exact alarm は使わない。朝通知も WorkManager ベースで十分。
（`setExact()` は Android 14 でデフォルト拒否のため最初は避ける）

---

## 6. 通知設計

### 通知種別（最小 3 種）

| 通知 | トリガー | 文面 |
|---|---|---|
| 朝の要約 | WorkManager 朝枠 | `generateSummaryText` 相当の出力そのまま |
| stale / fallback 状態 | `status=failed` + 長時間未更新 | 「前回取得分を表示 / 初回取得前」 |
| 候補ヒット | candidate スコア閾値超え | 資産名 + priceLabel + 方向 |

### 権限

```kotlin
// Android 13+ 必須
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
    requestPermissions(arrayOf(POST_NOTIFICATIONS), REQUEST_CODE)
}
// 機能価値が見えたタイミングで取りに行く（初回起動時ではなく最初の通知生成直前）
```

### 表示ルール（Web と同一）

```
- 現在値  →  canPretendCurrent=true のときのみ
- 状態行  →  status=failed のときのみ
- 状態行なし  →  idle / success
```

---

## 7. ホーム画面ウィジェット（Glance）

```kotlin
@Composable
fun PriceWidgetContent(state: WidgetState) {
    Column {
        // 小サイズ: 総資産 / stale 状態 / 候補件数
        TotalAssetsRow(state.totalAssets, state.fetchStatus)
        if (state.isStale) StaleIndicator()

        // 中サイズ: 価格 3 件 + 状態行
        state.topQuotes.forEach { q ->
            QuoteRow(
                ticker    = q.ticker,
                priceLabel = q.freshnessView.priceLabel,    // "現在値" / "終値" / etc.
                asOfLabel  = q.freshnessView.asOfLabel,
                value      = q.value,
            )
        }
        if (state.fetchStatus == FAILED) {
            Text("前回取得分を表示")  // 状態行
        }
    }
}
```

**更新タイミング:**

| タイミング | 実装 |
|---|---|
| アプリ起動 | `GlanceAppWidgetManager.update()` |
| WorkManager 同期後 | Worker 末尾で呼ぶ |
| 通知生成時 | 連動更新 |
| `updatePeriodMillis` | 30 分（バックアップ） |

---

## 8. 保存設計

### Room（price 系）

```sql
-- quote_snapshots
CREATE TABLE quote_snapshots (
    asset_id       TEXT PRIMARY KEY,
    asset_class    TEXT NOT NULL,
    quote_kind     TEXT NOT NULL,
    value          REAL NOT NULL,
    baseline_date  TEXT NOT NULL,
    market_data_at TEXT,
    synced_at      TEXT NOT NULL,
    ticker         TEXT,
    name           TEXT
);

-- fetch_status
CREATE TABLE fetch_status (
    id             INTEGER PRIMARY KEY DEFAULT 1,
    status         TEXT NOT NULL DEFAULT 'idle',
    error_kind     TEXT,
    fallback_used  INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TEXT,
    last_success_at TEXT,
    last_error_at  TEXT
);

-- summary_cache
CREATE TABLE summary_cache (
    generated_at TEXT PRIMARY KEY,
    text         TEXT NOT NULL
);
```

### DataStore（設定系）

```kotlin
// UserPrefs
data class UserPrefs(
    val morningNotificationEnabled: Boolean = true,
    val morningNotificationHour: Int = 8,
    val staleNotificationEnabled: Boolean = true,
    val candidateNotificationEnabled: Boolean = true,
    val widgetTickerIds: List<String> = emptyList(),
    val verboseLogEnabled: Boolean = false,
)
```

---

## 9. 画面一覧

| 画面 | 主な内容 | Phase |
|---|---|---|
| **Home** | 総資産・stale/fallback 状態・候補件数・最終同期時刻 | 1 |
| **Prices** | 主要 3〜5 資産・priceLabel・asOfLabel・FreshnessBadge | 1 |
| **Notification Settings** | 朝通知・stale 通知・候補通知・権限状態 | 1 |
| **Diagnostics** | [fetch] / [freshness] ログ・キャッシュ状態・runbook 的確認 | 2 |
| **Trigger 編集** | クイックアクション・planned/confirmed 操作 | 3 |

ジャーナル・詳細入力は Phase 3 以降。最初は Web 側に残す。

---

## 10. 移行フェーズ

### Phase 1 — Android Companion MVP（目安 2〜3 週間）

```
[ ] core-contract を Kotlin に切る
[ ] FreshnessEvaluator を Kotlin 移植（純粋関数 → テスト先行）
[ ] SummaryTextBuilder を Kotlin 移植
[ ] Room + SnapshotFetcher + SnapshotAdapter
[ ] WorkManager (定期 15分 + 起動時 one-time)
[ ] 通知 3 種 (朝要約 / stale / 候補)
[ ] Glance ウィジェット (小・中)
[ ] Compose Home (総資産 / 状態 / 候補件数)
[ ] Compose Prices (価格一覧 + freshness badge)
```

### Phase 2 — Native Summary / Diagnostics 強化

```
[ ] 価格詳細画面
[ ] stale / fallback 詳細
[ ] candidate 詳細
[ ] Diagnostics 画面 ([fetch] / [freshness] ログ)
[ ] Notification Settings 画面
```

### Phase 3 — 必要なら入力系も Android 化

```
[ ] trigger 編集
[ ] quick action
[ ] planned / confirmed 操作
```

---

## 11. 移植上の注意点

### 東証の営業日判定

`isJapanHoliday()` は Kotlin で再実装が必要。
最初は祝日リストをハードコードし、年次更新を検討する。

### `canPretendCurrent` の判定

```kotlin
fun canPretendCurrent(
    quoteKind: QuoteKind,
    marketDataAt: Instant?,
    now: Instant,
    session: MarketSession,
): Boolean {
    if (quoteKind != QuoteKind.INTRADAY) return false
    if (marketDataAt == null) return false
    if (session !in setOf(MORNING, LUNCH_BREAK, AFTERNOON)) return false
    val ageMinutes = Duration.between(marketDataAt, now).toMinutes()
    return ageMinutes <= 20
}
```

この関数は Web の `evaluateFreshness` 実装と **同一の結果** を返さなければならない。

### テスト戦略

```
core-engine は純粋関数のみ → JUnit5 で完全カバー
data 層 → Room in-memory DB でテスト
Worker → WorkManager TestDriver
Notification / Widget → 手動確認（UI テストは後回し）
```

Web 側の `marketScenarios.ts` fixture と同じシナリオを Kotlin 側にも移植する。

---

## 12. 既知制約（Known Limitations 継承）

| 制約 | 対応 |
|---|---|
| 平日場中の `現在値` 実機確認は時間依存 | Phase 1 終了後に場中で確認。それまでは「来なくても破綻しない」設計を優先 |
| snapshot server 未接続時は候補が保守的に抑制 | `market_context_missing` 理由を UI に表示 |
| stale 値は表示継続・`現在値` 扱いしない | 縮退ルール継承。Widget/通知でも同じ |
| Exact alarm は Android 14 でデフォルト拒否 | 初版は WorkManager のみ。Exact が必要になったら再検討 |
| 通知は Android 13+ でデフォルトオフ | 機能価値が見えたタイミングで許可を取りに行く |

---

*このドキュメントは Antigravity Web (PR8–PR20) の仕様を引き継ぐ Android 設計書。*
*実装着手は Phase 1 から。UI より先に core-contract を固定する。*
