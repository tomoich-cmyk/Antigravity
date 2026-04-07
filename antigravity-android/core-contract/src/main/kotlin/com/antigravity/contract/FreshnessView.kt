package com.antigravity.contract

/**
 * 鮮度評価結果 — Web 側 FreshnessView の Kotlin 移植。
 *
 * 不変条件:
 *   - canPretendCurrent=true は fresh な intraday のみ
 *   - close/nav/reference/stale は常に canPretendCurrent=false
 *   - priceLabel は canPretendCurrent=true のとき "現在値"
 */
data class FreshnessView(
    val isStale: Boolean,
    val level: FreshnessLevel,
    val reason: FreshnessReason? = null,
    val asOfLabel: String,
    /** 通知・Widget に表示するラベル ("現在値" / "終値" / "基準価額" / "参考" / "取得値") */
    val priceLabel: String,
    val canPretendCurrent: Boolean,
    val message: String? = null,
)
