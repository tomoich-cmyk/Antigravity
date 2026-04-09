package com.antigravity.data.remote

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * サーバーレスポンス DTO — Web 側 snapshot.ts の型を Kotlin に移植。
 *
 * エンドポイント: GET http://127.0.0.1:3001/market-snapshot
 *
 * 不変条件:
 *   - fetchedAt : サーバーが応答した時刻 (ISO-8601)
 *   - stocks    : 銘柄ごとの最新価格
 *   - context   : 市場セッション情報
 *   - _meta     : スキーマバージョン等（省略可）
 */
@Serializable
data class MarketSnapshotDto(
    val fetchedAt: String,
    val stocks: StocksDto = StocksDto(),
    val context: ContextDto = ContextDto(),
    @SerialName("_meta") val meta: MetaDto? = null,
)

@Serializable
data class StocksDto(
    val gmopg:   StockQuoteDto? = null,
    val unext:   StockQuoteDto? = null,
    val ab:      StockQuoteDto? = null,
    val invesco: StockQuoteDto? = null,
)

@Serializable
data class StockQuoteDto(
    val price: Double,
    val changePct: Double? = null,
    val source: String = "",
    val marketDataAt: String? = null,
    val syncedAt: String? = null,
    /** "market" | "close" | "official" | null */
    val priceKind: String? = null,
    val baselineDate: String? = null,
)

@Serializable
data class ContextDto(
    val marketSession: String? = null,
    val businessDate: String? = null,
)

@Serializable
data class MetaDto(
    val schemaVersion: String? = null,
)
