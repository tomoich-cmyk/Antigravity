# Antigravity Android — Internal Pilot Checklist

記録単位: 1日1行。3〜7日間運用後に判断。

## 確認項目

| # | 項目 | 確認方法 |
|---|------|----------|
| 1 | 朝の通知がうるさすぎない | 朝に音が鳴るか / 2回目以降はサイレントか |
| 2 | failure → success で状態通知が消える | API止めて再開、または SyncNow で回復確認 |
| 3 | Widget と Home の表示が一致する | 同じ銘柄の価格・ラベルを並べて目視 |
| 4 | 手動同期連打で破綻しない | 「今すぐ同期」を素早く 5 回タップ |
| 5 | 電池最適化下でも WorkManager が動く | 設定 → アプリ → 電池最適化 → 制限ON、翌朝確認 |
| 6 | Diagnostics で原因追跡できる | 故意に失敗させて errorKind / fallback / syncedAt を確認 |

---

## 日次ログ

| 日付 | 端末 / Android | 1 通知 | 2 状態回復 | 3 Widget一致 | 4 連打 | 5 電池 | 6 診断 | 気づき |
|------|---------------|--------|------------|-------------|--------|--------|--------|--------|
|      |               |        |            |             |        |        |        |        |
|      |               |        |            |             |        |        |        |        |
|      |               |        |            |             |        |        |        |        |
|      |               |        |            |             |        |        |        |        |
|      |               |        |            |             |        |        |        |        |
|      |               |        |            |             |        |        |        |        |
|      |               |        |            |             |        |        |        |        |

記入例: ✅ OK / ❌ NG / ⚠️ 要観察 / — 未確認

---

## 本番署名 TODO (パイロット拡大前に完了させる)

- [ ] `keytool` でキーストア生成 (手順は `keystore.properties.template` 参照)
- [ ] `keystore.properties` を作成・記入
- [ ] `./gradlew :app:assembleRelease` で本番署名 APK 生成確認
- [ ] `antigravity-release.jks` + `keystore.properties` をバックアップ保管
      (Google Drive / 1Password / Bitwarden など)
- [ ] パイロット端末に新 APK を再インストール (署名変更のため一度アンインストール必要)

---

## 判定基準

3日以上、全項目 ✅ → **正式 RC / 配布判断へ**

重大 NG あり → Issues に起票して修正してから再計測
