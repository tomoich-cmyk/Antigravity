package com.antigravity.contract

/**
 * 価格スナップショット — Web 側 QuoteSnapshot の Kotlin 移植。
 *
 * 不変条件:
 *   - syncedAt  : サーバーから取得した時刻 (ISO-8601 JST)
 *   - marketDataAt : 価格が成立した時刻 (ISO-8601 JST, null = 不明)
 *   - baselineDate : 価格の所属日 ("yyyy-MM-dd" JST)
 *   → syncedAt と marketDataAt を混同しないこと
 */
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

data class QuoteSource(
    val id: SourceId,
    val mode: SourceMode,
    val label: String,
)
