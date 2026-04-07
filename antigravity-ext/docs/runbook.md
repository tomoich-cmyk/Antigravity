# Antigravity 運用 Runbook

通知がおかしいとき、まずここを見る。

---

## 確認の順番

```
1. DevTools Console → Verbose フィルタ
2. [fetch] ログを確認 → 取得成否
3. [freshness] ログを確認 → 鮮度判定の根拠
4. 要約ログ (設定画面 → 要約・通知設定) で文面を目視
5. localStorage でデータを直接確認
```

---

## ログの見方

### [fetch] ログ

```
[fetch] source=snapshot_server status=success quotes=2 fallbackUsed=false
[fetch] source=snapshot_server status=failed errorKind=timeout fallbackUsed=true
[fetch] source=snapshot_server status=failed errorKind=network lastSuccessAt=2026-04-06 09:00 fallbackUsed=true
```

| フィールド | 意味 |
|-----------|------|
| `status=success` | 取得成功。price が更新された |
| `status=failed` | 取得失敗。前回成功値を継続表示 |
| `errorKind` | 失敗原因 (下表参照) |
| `lastSuccessAt` | 最後に成功した時刻 |
| `fallbackUsed=true` | 前回成功値を表示中 |

**errorKind の一覧**

| errorKind | 原因 |
|-----------|------|
| `network` | サーバーに到達できない |
| `timeout` | 8 秒タイムアウト |
| `http` | 4xx / 5xx |
| `invalid_payload` | JSON パース失敗 |
| `adapter_error` | snapshotToQuoteSnapshots が throw |
| `empty_snapshot` | fetch 成功だが有効な price が 0 件 |

### [freshness] ログ

```
[freshness] assetId=asset-gmopg quoteKind=intraday baselineDate=2026-04-06 marketDataAt=2026-04-06 09:50 level=fresh canPretendCurrent=true priceLabel=現在値
[freshness] assetId=asset-gmopg quoteKind=intraday baselineDate=2026-04-03 marketDataAt=2026-04-03 10:00 level=stale canPretendCurrent=false priceLabel=取得値
```

| フィールド | 意味 |
|-----------|------|
| `level` | fresh / lagging / stale / unknown |
| `canPretendCurrent` | true = 現在値表示OK |
| `priceLabel` | 通知に出るラベル |

**level の判定基準**

| level | 条件 |
|-------|------|
| `fresh` | 場中 20 分以内 / 当日終値 / 前営業日 close/nav |
| `lagging` | 場中 20〜60 分 / nav 2 営業日差 (祝日挟み) |
| `stale` | 前日以前 / 場中 60 分超 / nav 3 営業日以上 |
| `unknown` | marketDataAt なし |

---

## よくある原因と対処

### 「更新: 不明」と表示される

**これは正常。** `syncedAt`（サーバーからの取得時刻）が記録されていない状態。

- サーバーに一度も接続していない、または localStorage にまだ `syncedAt` が保存されていない
- 価格値が存在すれば表示はされる。鮮度判定は `baselineDate` / `marketDataAt` で行う
- サーバーに接続して取得が成功すると `syncedAt` が更新され「不明」が解消される

---

### 「現在値が出ない」

**確認順:**

1. `[freshness]` で `canPretendCurrent=false` になっている
2. `level` を確認:
   - `stale` → marketDataAt が前日以前。前回取得が古い
   - `lagging` → 20〜60 分前のデータ。場中なら自然に回復する
   - `unknown` → marketDataAt が null。adapter が marketDataAt を付けていない

**よくある原因:**

| 原因 | 確認方法 |
|------|---------|
| 場外 (after_close / holiday) | 現在時刻が 15:30 以降 or 土日祝 |
| サーバー側が close で返している | `[freshness]` の `quoteKind=close` |
| marketDataAt が欠損 | `level=unknown` かつ `reason=missing_market_time` |

---

### 「更新注意が消えない」

**確認順:**

1. `[freshness]` で `level=stale`, `baselineDate` が今日より前
2. `[fetch]` で最後に `status=success` になった時刻を確認
3. サーバー側 (`antigravity-server`) が起動しているか確認

**よくある原因:**

| 原因 | 対処 |
|------|------|
| サーバー停止中 | `[fetch] errorKind=network` が続いている。サーバーを起動する |
| provider delay | サーバーは動いているが market data が古い。サーバー側を確認 |
| holiday (祝日) | `getMarketSessionTokyo` が `holiday` を返している。意図通り |
| stale cache | localStorage の `antigravity_state` の `marketDataAt` が古い。手動で更新 |

---

### 「候補がずっと出ない」

**確認順:**

1. 要約ログで `市場コンテキスト未同期` が出ているか
2. `[fetch]` でコンテキスト取得が成功しているか
3. `state.marketContext` が null でないか (DevTools → Application → localStorage)

**よくある原因:**

| 原因 | 対処 |
|------|------|
| `market_context_missing` | MarketContext が未取得。サーバーからの取得を待つ |
| `score_below_threshold` | 全資産が閾値未達。価格帯を確認 |
| `stale_market_data` | 全資産 stale。`[fetch]` を確認 |

---

### 「価格は見えるが 前回取得分を表示 が出る」

**これは正常な縮退動作。**

- fetch に失敗しているが、前回成功値を継続表示している状態
- 価格は古い可能性があるが、`現在値` には絶対にならない (鮮度判定で lagging/stale になる)

**確認すべきこと:**

1. `[fetch] status=failed errorKind=?` で原因を特定
2. `lastSuccessAt` が長時間前なら価格の鮮度も怪しい
3. サーバーの再起動や URL 設定 (設定画面 → システム設定) を確認

---

## localStorage の直接確認

**fetch 状態を見る:**

```js
JSON.parse(localStorage.getItem('antigravity_fetch_status'))
```

**price state を見る:**

```js
const s = JSON.parse(localStorage.getItem('antigravity_state'));
s.priceState  // 各 assetId の price, marketDataAt, baselineDate
```

**fetch 状態をリセット (実験用):**

```js
localStorage.removeItem('antigravity_fetch_status')
```

---

## 手動 QA チェックポイント

| 時刻帯 | 期待動作 |
|--------|---------|
| 平日 08:30 (pre_open) | close → 終値、nav → 基準価額。現在値なし |
| 平日 10:00 (前場) | intraday 10 分以内 → 現在値 |
| 平日 10:40 (前場) | intraday 30 分超 → やや遅延。現在値なし |
| 平日 16:00 (after_close) | intraday → 終値扱い。現在値なし |
| 土日祝 | holiday 扱い。現在値なし |
| fetch 失敗 | 前回取得分を表示。現在値なし |
| 初回起動 + fetch 失敗 | 価格表示なし or 初回取得前 文言 |

---

## テストファイルの対応表

| テストファイル | カバー範囲 |
|--------------|-----------|
| `freshness.test.ts` | evaluateFreshness 判定ロジック (17 件) |
| `holidays.test.ts` | 祝日プロバイダー (25 件) |
| `snapshotAdapter.test.ts` | adapter 変換 (30 件) |
| `summaryText.test.ts` | buildQuoteSummaryLine / buildCandidateReasonText (8 件) |
| `generateSummary.test.ts` | generateSummaryText 準統合 (6 件) |
| `snapshot.test.ts` | 通知文面スナップショット / fixture 網羅 (21 件) |
| `fetchFallback.test.ts` | 取得失敗縮退 (13 件) |
| `notificationSmoke.test.ts` | E2E スモーク 5 シナリオ (31 件) |

合計: **162 件**
