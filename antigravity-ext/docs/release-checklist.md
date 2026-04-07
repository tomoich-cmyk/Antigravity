# Release Checklist — RC 受け入れ基準

> このドキュメントは「リリース判定会議」の入力として使う。
> 全項目を確認し、最下部の判定欄に記入して完了とする。

---

## 1. 自動テスト

| チェック | 確認方法 | 合否 |
|---|---|---|
| 全テスト green (162 件以上) | `npm test` — Tests: N passed | ☐ |
| TypeScript エラーなし | `npx tsc --noEmit` — 出力なし | ☐ |
| E2E スモーク 5 シナリオ green | notificationSmoke.test.ts — 全 pass | ☐ |

---

## 2. 手動 QA（docs/qa-checklist.md の 7 シナリオ）

| # | シナリオ | 合否 |
|---|---|---|
| QA-1 | 平日朝: close + nav → 終値 / 基準価額 が出る | ☐ |
| QA-2 | 場中 fresh: intraday 10 分以内 → 現在値 が出る | ☐ |
| QA-3 | 場中 lagging: intraday 30 分超 → やや遅延 / 現在値なし | ☐ |
| QA-4 | stale 混在: 更新注意 + 候補ブロック理由が共存 | ☐ |
| QA-5 | fetch failure + cache あり → 前回取得分を表示 が出る | ☐ |
| QA-6 | fetch failure + cache なし (初回) → 初回取得前 が出る | ☐ |
| QA-7 | idle 状態 (未試行) → 状態行が一切出ない | ☐ |

---

## 3. 機能不変条件

以下は自動テストで担保済みだが、リリース前に目視でも確認する。

| 不変条件 | 根拠 | 合否 |
|---|---|---|
| `現在値` は fresh intraday (20 分以内) のみ | canPretendCurrent=true の条件 | ☐ |
| `status=idle` では状態行なし | buildFetchStatusText idle テスト | ☐ |
| `status=failed` でのみ状態行あり | fetchFallback.test.ts | ☐ |
| fetch 失敗時に price state を書き換えない | backgroundTasks.ts 縮退ルール | ☐ |
| mock / test fixture が本番経路に混入しない | storage.ts: window 判定ガード | ☐ |

---

## 4. ドキュメント

| チェック | 合否 |
|---|---|
| docs/runbook.md が最新 (errorKind 一覧・よくある 4 問題含む) | ☐ |
| docs/qa-checklist.md が最新 (7 シナリオ・セットアップ JS 付き) | ☐ |

---

## 5. Known Limitations（既知制約）

以下は制約として認識・受け入れ済み。Hold 判定には **しない**。

- **平日場中の `現在値` 実機確認は時間依存**
  → 場中 (9:00–11:30 / 12:30–15:30) の実機検証は営業時間内にしか行えない。
  　自動テストで代替済み。

- **snapshot source 未接続時は候補が保守的に抑制される**
  → `market_context_missing` 理由で候補ブロック。ユーザー向けには理由行を表示する。

- **stale 値は表示継続されるが `現在値` 扱いしない**
  → fetch 失敗 / 古い intraday どちらの場合も priceLabel は `現在値` にならない。
  　縮退ルールにより価格表示は維持するが鮮度警告を付与する。

---

## 6. リリース判定

```
判定日時: ____-__-__ __:__
確認者:
```

- [ ] **Go** — 全チェック完了、known limitations 受け入れ済み
- [ ] **Go with known limitations** — 上記 Known Limitations を明記してリリース
- [ ] **Hold** — 理由: ________________________________

---

*このチェックリストは PR20 で追加。前工程: PR19 (release-prep)。*
