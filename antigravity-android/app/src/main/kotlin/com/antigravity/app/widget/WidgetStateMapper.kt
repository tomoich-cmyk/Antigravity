package com.antigravity.app.widget

import com.antigravity.contract.QuoteSnapshot
import com.antigravity.contract.SnapshotFetchState
import com.antigravity.data.db.SummaryCacheEntity
import com.antigravity.engine.FreshnessEvaluator
import java.time.ZonedDateTime

/**
 * Room データ → WidgetUiState へのマッピング。
 *
 * 設計方針:
 *   - 副作用なし・Android 依存なし → 単体テスト可能
 *   - Small は summary_cache 主体 (要約テキスト1行)
 *   - Medium は quote_snapshots 主体 (最大3件 × FreshnessEvaluator)
 *   - fetch 失敗でも fallback 中なら summary を継続表示する
 *
 * canPretendCurrent ルール (HomeViewModel と同一):
 *   fresh INTRADAY (marketDataAt から 20 分以内) のみ "現在値" を表示。
 *   それ以外は asOfLabel ("4/5 終値" 等) を使う。
 */
object WidgetStateMapper {

    fun map(
        summary: SummaryCacheEntity?,
        fetchStatus: SnapshotFetchState?,
        quotes: List<QuoteSnapshot>,
        now: ZonedDateTime,
    ): WidgetUiState {
        val isFailure  = fetchStatus?.status == SnapshotFetchState.FetchStatus.FAILED
        val isFallback = fetchStatus?.fallbackUsed == true
        val lastSyncAt = fetchStatus?.lastSuccessAt

        // ─── Small: 状態サマリー1行 ──────────────────────────────────────────
        // FAILED + fallback 中であっても summary があれば表示する (縮退表示)
        val summaryLine = when {
            isFailure && !isFallback -> "取得エラー"
            summary != null          -> summary.summaryText.lines().firstOrNull()?.trim() ?: "---"
            quotes.isEmpty()         -> "データなし"
            else                     -> "---"
        }

        // ─── Medium: 主要3資産 ────────────────────────────────────────────────
        val quoteRows = quotes.take(3).map { quote ->
            val fv = FreshnessEvaluator.evaluate(quote, now)
            WidgetQuoteRow(
                displayName    = quote.assetId.toDisplayName(),
                price          = "%,d円".format(quote.value.toLong()),
                timeLabel      = if (fv.canPretendCurrent) fv.priceLabel else fv.asOfLabel,
                freshnessLevel = fv.level,
            )
        }

        return WidgetUiState(
            summaryLine = summaryLine,
            lastSyncAt  = lastSyncAt,
            isFailure   = isFailure,
            isFallback  = isFallback,
            quoteRows   = quoteRows,
        )
    }
}

/** assetId を画面表示名に変換する (HomeViewModel と同じロジック)。 */
private fun String.toDisplayName(): String = when (this) {
    "asset-gmopg" -> "GMO-PG"
    "asset-unext" -> "U-NEXT"
    else          -> removePrefix("asset-").uppercase()
}
