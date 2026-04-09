package com.antigravity.data.remote

import com.antigravity.contract.*

/**
 * MarketSnapshotDto → List<QuoteSnapshot> 変換 — Web 側 snapshotAdapter.ts の Kotlin 移植。
 *
 * マッピング規則:
 *   assetId    : "gmopg" → "asset-gmopg", "unext" → "asset-unext"
 *               "ab"    → "asset-ab",     "invesco" → "asset-invesco"
 *   assetClass : JP_STOCK (上場株) / MUTUAL_FUND (投資信託: ab, invesco)
 *   quoteKind  : priceKind="close"    → CLOSE
 *                priceKind="official" → NAV
 *                priceKind="market"/null → INTRADAY
 *   baselineDate : DTO に含まれなければ fetchedAt の日付部分 (yyyy-MM-dd) を使う
 *   syncedAt     : DTO の syncedAt が null なら fetchedAt を使う
 */
object SnapshotAdapter {

    private data class AssetMeta(val assetId: String, val assetClass: AssetClass)

    private val ASSET_META_MAP = mapOf(
        "gmopg"   to AssetMeta("asset-gmopg",   AssetClass.JP_STOCK),
        "unext"   to AssetMeta("asset-unext",   AssetClass.JP_STOCK),
        "ab"      to AssetMeta("asset-ab",      AssetClass.MUTUAL_FUND),
        "invesco" to AssetMeta("asset-invesco", AssetClass.MUTUAL_FUND),
    )

    fun adapt(dto: MarketSnapshotDto): List<QuoteSnapshot> {
        val result = mutableListOf<QuoteSnapshot>()
        dto.stocks.gmopg?.let   { result += adaptStock("gmopg",   it, dto.fetchedAt) }
        dto.stocks.unext?.let   { result += adaptStock("unext",   it, dto.fetchedAt) }
        dto.stocks.ab?.let      { result += adaptStock("ab",      it, dto.fetchedAt) }
        dto.stocks.invesco?.let { result += adaptStock("invesco", it, dto.fetchedAt) }
        return result
    }

    private fun adaptStock(
        key: String,
        quote: StockQuoteDto,
        fetchedAt: String,
    ): QuoteSnapshot {
        val meta       = ASSET_META_MAP[key] ?: AssetMeta("asset-$key", AssetClass.JP_STOCK)
        val assetClass = meta.assetClass

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
            assetId      = meta.assetId,
            assetClass   = assetClass,
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
