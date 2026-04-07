# Antigravity Android Architecture

## 1. 責務分担

Antigravity の Android 化は、全面移植ではなく **Companion App** として設計する。

* **Web/PWA**

  * 編集
  * 検証
  * 重い画面
  * 詳細設定
  * 開発時の迅速な確認
* **Android**

  * 同期
  * 通知
  * ホーム画面ウィジェット
  * 軽量ダッシュボード
  * クイックアクション
  * 診断表示

### 基本方針

* ビジネスルールは Web と Android で一致させる
* Android は OS 連携を担う
* 編集機能は初期フェーズでは Web 側に残す
* Android 初版は「現在値が出ること」よりも「古い値を現在値っぽく見せないこと」を優先する

---

## 2. 共通契約

Android 側では Web の TypeScript 契約を Kotlin に移植する。UI より先に型と不変条件を固定する。

### 2.1 QuoteSnapshot

```kotlin
enum class AssetClass {
    JP_STOCK,
    JP_ETF,
    JP_REIT,
    MUTUAL_FUND
}

enum class QuoteKind {
    INTRADAY,
    CLOSE,
    NAV,
    REFERENCE
}

enum class SourceId {
    MANUAL,
    SNAPSHOT_SERVER,
    BROKER_IMPORT,
    MOCK,
    CACHE
}

enum class SourceMode {
    REALTIME,
    DELAYED,
    EOD,
    DAILY_NAV,
    MANUAL,
    MOCK,
    CACHE
}

data class QuoteSource(
    val id: SourceId,
    val mode: SourceMode,
    val label: String,
)

data class QuoteSnapshot(
    val assetId: String,
    val assetClass: AssetClass,
    val value: Double,
    val currency: String = "JPY",
    val quoteKind: QuoteKind,
    val source: QuoteSource,
    val syncedAt: String,
    val marketDataAt: String?,
    val baselineDate: String,
)
```

### 2.2 FreshnessView

```kotlin
enum class FreshnessLevel {
    FRESH,
    LAGGING,
    STALE,
    UNKNOWN
}

enum class FreshnessReason {
    MARKET_CLOSED,
    PROVIDER_DELAY,
    MANUAL_OLD,
    MISSING_MARKET_TIME,
    NAV_NOT_UPDATED,
    HOLIDAY_GAP,
    UNSUPPORTED,
    UNKNOWN
}

data class FreshnessView(
    val isStale: Boolean,
    val level: FreshnessLevel,
    val reason: FreshnessReason? = null,
    val asOfLabel: String,
    val canPretendCurrent: Boolean,
    val message: String? = null,
)
```

### 2.3 SnapshotFetchState

```kotlin
enum class SnapshotFetchErrorKind {
    NETWORK,
    TIMEOUT,
    HTTP,
    INVALID_PAYLOAD,
    ADAPTER_ERROR,
    EMPTY_SNAPSHOT,
    UNKNOWN
}

data class SnapshotFetchState(
    val sourceId: SourceId = SourceId.SNAPSHOT_SERVER,
    val status: String,
    val lastAttemptAt: String? = null,
    val lastSuccessAt: String? = null,
    val lastErrorAt: String? = null,
    val errorKind: SnapshotFetchErrorKind? = null,
    val errorMessage: String? = null,
    val fallbackUsed: Boolean = false,
    val hasUsableCachedQuotes: Boolean = false,
)
```

### 2.4 不変条件

以下は Android 側でも必ず守る。

1. `syncedAt` と `marketDataAt` を混同しない
2. `baselineDate` は価格の所属日である
3. `canPretendCurrent=true` は fresh な intraday のみ
4. `close/nav/reference/stale` は現在値扱いしない
5. fetch 失敗時は価格を書き換えない
6. fallback 中は状態行で明示する

---

## 3. データフロー

### 3.1 正常系

`WorkManager / 手動更新 / 起動時同期`
→ `fetchMarketSnapshot()`
→ `snapshotToQuoteSnapshots()`
→ `saveQuoteSnapshots()`
→ `evaluateFreshness()`
→ `Room / DataStore 保存`
→ `通知 / Widget / Compose UI`

### 3.2 縮退系

fetch に失敗した場合:

* `applyQuoteSnapshots()` は呼ばない
* 既存の価格は保持する
* `SnapshotFetchState.status = failed`
* `fallbackUsed = true/false` を保存する
* 通知には `【状態】` を追加する

### 3.3 最重要ルール

> 取得に失敗しても表示を継続してよい。
> ただし、その値を現在値のように見せてはいけない。

---

## 4. モジュール設計

初期構成は 5 モジュールとする。

### 4.1 `core-contract`

責務:

* 型定義
* enum
* 契約

主なファイル:

* `QuoteSnapshot.kt`
* `FreshnessView.kt`
* `SnapshotFetchState.kt`
* `Enums.kt`

### 4.2 `core-engine`

責務:

* 純粋関数
* 鮮度判定
* summary 生成
* 祝日判定

主なファイル:

* `FreshnessEvaluator.kt`
* `MarketClock.kt`
* `HolidayProvider.kt`
* `SummaryTextBuilder.kt`
* `CandidateReasonTextBuilder.kt`

### 4.3 `data`

責務:

* fetch
* adapter
* Room
* DataStore
* repository

主なファイル:

* `SnapshotApi.kt`
* `SnapshotAdapter.kt`
* `QuoteSnapshotEntity.kt`
* `FetchStatusEntity.kt`
* `SummaryCacheEntity.kt`
* `MarketRepository.kt`

### 4.4 `feature-home`

責務:

* Compose UI
* Home / Prices / Diagnostics / Settings

主なファイル:

* `HomeScreen.kt`
* `PricesScreen.kt`
* `DiagnosticsScreen.kt`
* `NotificationSettingsScreen.kt`

### 4.5 `feature-widget-notification`

責務:

* Widget
* 通知
* Background sync

主なファイル:

* `MarketSyncWorker.kt`
* `SummaryNotificationBuilder.kt`
* `SmallSummaryWidget.kt`
* `MediumSummaryWidget.kt`

---

## 5. WorkManager

Android 側の定期同期は WorkManager を使う。

### 5.1 トリガー

1. **定期同期**

   * 15 分周期
   * 基本同期経路
2. **即時同期**

   * アプリ起動時
   * Widget 配置時
3. **手動同期**

   * ユーザー操作による refresh
4. **リトライ**

   * fetch failure 後の自動再実行

### 5.2 ポリシー

* exact alarm は使わない
* Android のバックグラウンド制約に合わせる
* 通知は「時刻ぴったり」より「誤認しないこと」を優先する

### 5.3 Exact alarm を使わない理由

* 権限と運用コストが重い
* Antigravity の要件は数分単位の正確さより説明可能性が重要
* 取得失敗時の縮退ルールが既にある

---

## 6. 通知設計

### 6.1 通知の種類

1. **朝の要約通知**

   * 主要資産
   * stale/fallback 状態
   * 候補状況
2. **状態通知**

   * fetch failure
   * stale/fallback
3. **候補通知**

   * 条件ヒット時のみ

### 6.2 Android 13 権限フロー

* 初回起動直後には要求しない
* 通知の価値がわかる画面で要求する
* 拒否時もアプリは継続利用可能とする

### 6.3 表示ルール

Web 側と同一ルールを採用する。

* fresh intraday のみ `現在値`
* lagging intraday は `asOfLabel + やや遅延`
* stale は `更新注意`
* close は `終値`
* nav は `基準価額`
* reference は `参考値`
* fetch failure 時のみ `【状態】` を表示

---

## 7. Glance ウィジェット

### 7.1 小サイズ

表示内容:

* 総資産
* stale / fallback 状態
* 候補件数

### 7.2 中サイズ

表示内容:

* 主要 3 資産
* `priceLabel`
* `asOfLabel`
* 状態行

### 7.3 更新タイミング

* WorkManager 定期同期後
* 手動同期後
* アプリ起動時
* 通知生成時

### 7.4 ウィジェット表示ルール

* 現在値表記は fresh intraday のみ
* stale 値でも表示は継続してよい
* ただし `asOfLabel` を必ず出す

---

## 8. 保存設計

### 8.1 Room テーブル

#### `quote_snapshots`

* assetId
* assetClass
* value
* currency
* quoteKind
* sourceId
* sourceMode
* sourceLabel
* syncedAt
* marketDataAt
* baselineDate

#### `fetch_status`

* sourceId
* status
* lastAttemptAt
* lastSuccessAt
* lastErrorAt
* errorKind
* errorMessage
* fallbackUsed
* hasUsableCachedQuotes

#### `summary_cache`

* summaryText
* generatedAt
* sessionType

### 8.2 DataStore キー

* `notifications_enabled`
* `morning_summary_enabled`
* `stale_alert_enabled`
* `candidate_alert_enabled`
* `summary_hour`
* `summary_minute`
* `preferred_assets`
* `verbose_diagnostics_enabled`

---

## 9. 画面一覧

### 9.1 Phase 1

#### Home

* 総資産
* 候補件数
* 最終同期時刻
* fallback/stale 状態

#### Prices

* 主要資産一覧
* `現在値 / 終値 / 基準価額`
* `asOfLabel`
* FreshnessBadge

#### Notification Settings

* 通知権限状態
* 朝通知
* stale 通知
* 候補通知

#### Diagnostics

* `[fetch]`
* `[freshness]`
* fetch status
* キャッシュ状況

### 9.2 Phase 2

* candidate 詳細
* stale 詳細
* 通知履歴
* summary 詳細

### 9.3 Phase 3

* trigger 編集
* quick action
* planned / confirmed 操作

---

## 10. 移行フェーズ

### Phase 1: Companion MVP

チェックリスト:

* [ ] core-contract を Kotlin 化
* [ ] FreshnessEvaluator を移植
* [ ] SummaryTextBuilder を移植
* [ ] Room 保存を実装
* [ ] WorkManager 同期を実装
* [ ] fetch failure fallback を実装
* [ ] 通知を実装
* [ ] Widget を実装
* [ ] Home を実装

### Phase 2

* Prices/Diagnostics 強化
* summary 詳細
* stale/candidate 可視化

### Phase 3

* 入力系の Android 化
* trigger / journal 系操作

---

## 11. 移植上の注意

### 11.1 祝日判定

* Web 側の休日ロジックと同じ判定粒度にそろえる
* 土日だけでなく日本祝日を含める
* 振替休日を忘れない

### 11.2 canPretendCurrent

Android 側でも必ず下記を守る。

* `true` になれるのは fresh intraday のみ
* close/nav/reference/stale は常に `false`
* fallback 中は `false`

### 11.3 テスト戦略

* Web 側 fixture と同じシナリオ名を使う
* Kotlin/JUnit で以下を最低限移植する

  * `weekdayMorningCloseNav`
  * `intradayFresh`
  * `intradayLagging`
  * `staleWithCandidateBlock`
  * `mixedNoCurrentLeak`
* summary 出力の断片固定を行う
* fetch failure + fallback シナリオを通す

### 11.4 最重要方針

UI より先に、型と純粋関数を移植する。

> 型と純粋関数が揃えば、残りは接続である。

---

## 12. Known Limitations 継承

Android 側も Web 側の既知制約をそのまま引き継ぐ。

1. 平日場中の `現在値` 実機確認は時間依存である
2. snapshot source 未接続時は候補が保守的に抑制される
3. stale 値は表示継続されるが現在値扱いしない

### 補足

これは欠陥ではなく、誤認防止を優先した設計上の意図である。

---

## Phase 1 着手の推奨順

1. `core-contract` を Kotlin に切る
2. `FreshnessEvaluator` を移植する
3. `SummaryTextBuilder` を移植する
4. `Room + WorkManager` を実装する
5. `通知 → Widget → Compose Home` の順でつなぐ

### 理由

* UI より先に判定仕様を固定した方が後戻りが少ない
* Android の価値は OS 連携にある
* 通知・Widget・Background Sync を先に実装することで、Companion App としての価値が早く出る
