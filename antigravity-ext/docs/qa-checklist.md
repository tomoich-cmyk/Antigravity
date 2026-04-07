# 手動 QA チェックリスト

実機確認の標準手順。リリース前・バグ修正後に実施する。

---

## 前提

- dev server 起動済み (`npm run dev` → http://localhost:5173)
- DevTools Console → **Verbose** フィルタ有効
- 設定画面 → 要約・通知設定 の「今すぐ生成」ボタンで任意タイミングで生成可能

---

## シナリオ 1: 平日朝 08:30 (pre_open)

**セットアップ**

```js
// localStorage で GMOPG を close (前営業日終値) に設定
const s = JSON.parse(localStorage.getItem('antigravity_state'));
s.priceState['asset-gmopg'].priceKind = 'close';
s.priceState['asset-gmopg'].marketDataAt = '2026-04-03T15:30:00+09:00';
s.priceState['asset-gmopg'].baselineDate = '2026-04-03';
localStorage.setItem('antigravity_state', JSON.stringify(s));
```

**確認項目**

- [ ] AssetCard の価格ラベルが「終値」
- [ ] AssetCard に「現在値」が表示されない
- [ ] FreshnessBadge が表示されない (fresh 状態)
- [ ] 要約生成 → 「4/3 終値」の文言が含まれる
- [ ] 要約に「現在値」が含まれない
- [ ] `[freshness]` ログ: `level=fresh canPretendCurrent=false priceLabel=終値`

---

## シナリオ 2: 前場 10:00 (intraday fresh)

**セットアップ**

```js
const s = JSON.parse(localStorage.getItem('antigravity_state'));
const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
const todayYmd = new Date(Date.now() + 9*3600*1000).toISOString().slice(0,10);
s.priceState['asset-gmopg'].priceKind = 'market';
s.priceState['asset-gmopg'].marketDataAt = tenMinAgo;
s.priceState['asset-gmopg'].baselineDate = todayYmd;
localStorage.setItem('antigravity_state', JSON.stringify(s));
```

> ※ **実際に平日前場 10:00 前後に実施**することで自然に確認できる。
> 場外では "終値" に倒れるため `現在値` は出ない（これが正しい動作）。

**確認項目**

- [ ] AssetCard の価格ラベルが「現在値」
- [ ] FreshnessBadge が表示されない (fresh 状態)
- [ ] 要約生成 → 「現在値 x,xxx円」の文言が含まれる
- [ ] 要約に「終値」「基準価額」「やや遅延」「更新注意」が含まれない
- [ ] `[freshness]` ログ: `level=fresh canPretendCurrent=true priceLabel=現在値`

---

## シナリオ 3: 前場遅延 10:40 (intraday lagging)

**セットアップ**

```js
const s = JSON.parse(localStorage.getItem('antigravity_state'));
const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
const todayYmd = new Date(Date.now() + 9*3600*1000).toISOString().slice(0,10);
s.priceState['asset-gmopg'].priceKind = 'market';
s.priceState['asset-gmopg'].marketDataAt = thirtyMinAgo;
s.priceState['asset-gmopg'].baselineDate = todayYmd;
localStorage.setItem('antigravity_state', JSON.stringify(s));
```

> ※ **実際に平日前場で実施**すること。

**確認項目**

- [ ] AssetCard の価格ラベルに「現在値」が出ない
- [ ] FreshnessBadge が amber/黄 (lagging)
- [ ] 要約生成 → 「時点」「やや遅延」の文言が含まれる
- [ ] 要約に「現在値」が含まれない
- [ ] `[freshness]` ログ: `level=lagging canPretendCurrent=false`

---

## シナリオ 4: 引け後 16:00 (after_close)

> ※ **平日 15:30 以降に実施**。または localStorage で時刻を巻き戻さず、単に 15:30 以降に確認する。

**確認項目**

- [ ] intraday データがあっても AssetCard に「現在値」が出ない
- [ ] 価格ラベルが「終値」または「hh:mm 終値」
- [ ] 要約生成 → 「終値」「基準価額」のみ。「現在値」なし
- [ ] `[freshness]` ログ: `level=fresh canPretendCurrent=false reason=market_closed`

---

## シナリオ 5: 土日祝 (holiday)

> ※ **土日に実施**、または祝日に実施。

**確認項目**

- [ ] AssetCard に「現在値」が出ない
- [ ] FreshnessBadge が表示されない or fresh
- [ ] 要約生成 → 「終値」または前営業日の価格ラベル
- [ ] `[freshness]` ログ: `level=fresh canPretendCurrent=false reason=market_closed`
- [ ] `[fetch]` ログ: サーバーが停止中であれば `status=failed` が出る（正常）

---

## シナリオ 6: fetch failure + cache あり

**セットアップ**

```js
// 先に価格データが入っている状態で、snapshot サーバーを停止する
// または URL を存在しないものに変更する
// 設定画面 → システム設定 → スナップショット URL を変更
```

**確認項目**

- [ ] アプリがクラッシュしない
- [ ] 価格表示が消えない (前回値が継続表示される)
- [ ] AssetCard に「現在値」が出ない (stale/lagging になる)
- [ ] 要約生成 → 「前回取得分を表示しています」の状態行が出る
- [ ] 要約に「現在値」が含まれない
- [ ] `[fetch]` ログ: `status=failed errorKind=network fallbackUsed=true`
- [ ] `[freshness]` ログ: `level=stale` または `level=lagging`

---

## シナリオ 7: fetch failure + cache なし (初回起動前)

**セットアップ**

```js
// localStorage を完全クリアしてサーバー停止状態で起動
localStorage.clear();
// スナップショット URL を存在しないものに変更してページリロード
```

**確認項目**

- [ ] アプリがクラッシュしない
- [ ] 価格表示が空/ダッシュ (初期値) になる
- [ ] 「現在値」が一切出ない
- [ ] 要約生成 → 「初回取得前」の文言が含まれる
- [ ] `[fetch]` ログ: `status=failed fallbackUsed=true`
- [ ] `antigravity_fetch_status` に `lastSuccessAt` がない

---

## 確認後のリセット

```js
// URL を元に戻す
localStorage.removeItem('antigravity_snapshot_url');
// fetch 状態をリセット
localStorage.removeItem('antigravity_fetch_status');
// ページリロード
location.reload();
```
