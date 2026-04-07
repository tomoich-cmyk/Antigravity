package com.antigravity.engine

import com.antigravity.contract.CandidateBlockReason

/**
 * 候補ブロック理由コードを人が読める文言に変換する — Web 側 buildCandidateReasonText の Kotlin 移植。
 */
object CandidateReasonTextBuilder {

    /**
     * 出力例:
     *   "市場コンテキスト未同期のため、買付候補は保守的に非表示です。"
     *   "価格鮮度が低いため、候補評価をスキップしました。"
     *   "閾値未達のため候補なし。"
     */
    fun build(reason: CandidateBlockReason): String = when (reason) {
        CandidateBlockReason.MARKET_CONTEXT_MISSING ->
            "市場コンテキスト未同期のため、買付候補は保守的に非表示です。"
        CandidateBlockReason.STALE_MARKET_DATA ->
            "価格鮮度が低いため、候補評価をスキップしました。"
        CandidateBlockReason.SCORE_BELOW_THRESHOLD ->
            "閾値未達のため候補なし。"
    }
}
