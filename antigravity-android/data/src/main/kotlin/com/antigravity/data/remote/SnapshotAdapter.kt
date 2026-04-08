package com.antigravity.data.remote

import com.antigravity.contract.*

/**
 * MarketSnapshotDto → List<QuoteSnapshot> 変換 — Web 側 snapshotAdapter.ts の Kotlin 移植。
 *
 * マッピング規則:
 *   assetId    : "gmopg" → "asset-gmopg",  "unext" → "asset-unext"
 *   assetClass : JP_STOCK (両銘柄とも東証上場株)
 *   quoteKind  : priceKind="close"    → CLOSE
 *                priceKind="official" → NAV
 *                priceKind="market"/null → INTRADAY
 *   baselineDate : DTO に含まれなければ fetchedAt の日付部分 (yyyy-MM-dd) を使う
 *   syncedAt     : DTO の syncedAt が null なら fetchedAt を使う
 */
object SnapshotAdapter {

    private val ASSET_KEY_MAP = mapOf(
        "gmopg" to "asset-gmopg",
        "unext" to "asset-unext",
    )

    fun adapt(dto: MarketSnapshotDto): List<QuoteSnapshot> {
        val result = mutableListOf<QuoteSnapshot>()
        dto.stocks.gmopg?.let { result += adaptStock("gmopg", it, dto.fetchedAt) }
        dto.stocks.unext?.let { result += adaptStock("unext", it, dto.fetchedAt) }
        return result
    }

    private fun adaptStock(
        key: String,
        quote: StockQuoteDto,
        fetchedAt: String,
    ): QuoteSnapshot {
        val assetId = ASSET_KEY_MAP[key] ?: "asset-$key"

        val quoteKind = when (quote.priceKind) {
            "close"    -> QuoteKind.CLOSE
            "official" -> QuoteKind.NAV
            else       -> QuoteKind.INTRADAY   // "market" or null
        }

        // baselineDate が無ければ fetchedAt の先頭 10 文字 (yyyy-MM-dd) を使う
        val baselineDate = quote.baselineDate?.takeIf { it.isNotBlank() }
            ?: fetchedAt.take(10)

        // syncedAt が無ければ fetchedAt を使う
        val syncedAt = quote.syncedAt?.takeIf { it.isNotBlank() } ?: fetchedAt

        return QuoteSnapshot(
            assetId      = assetId,
            assetClass   = AssetClass.JP_STOCK,
            value        = quote.price,
            currency     = "JPY",
            quoteKind    = quoteKind,
            source       = QuoteSource(
                id    = SourceId.SNAPSHOT_SERVER,
                mode  = quoteKind.toSourceMode(),
                label = quote.source.ifEmpty { "snapshot-server" },
            ),
            syncedAt     = syncedAt,
            marketDataAt = quote.marketDataAt,
            baselineDate = baselineDate,
        )
    }

    private fun QuoteKind.toSourceMode(): SourceMode = when (this) {
        QuoteKind.INTRADAY  -> SourceMode.REALTIME
        QuoteKind.CLOSE     -> SourceMode.EOD
        QuoteKind.NAV       -> SourceMode.DAILY_NAV
        QuoteKind.REFERENCE -> SourceMode.MANUAL
    }
}
