package com.antigravity.engine

import com.antigravity.contract.*
import com.antigravity.engine.fixtures.MarketScenarios
import com.antigravity.engine.fixtures.MarketScenarios.PREV_BIZ
import com.antigravity.engine.fixtures.MarketScenarios.TODAY
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

/**
 * SummaryTextBuilder — Web 側 summaryText.test.ts / fetchFallback.test.ts の Kotlin 版
 *
 * fixture expectedInclude / expectedExclude を網羅するテストも含む。
 */
class SummaryTextBuilderTest {

    // ─── buildQuoteSummaryLine ────────────────────────────────────────────────

    @Test
    fun `1 場中 10 分前 intraday → 現在値 が出る`() {
        val s = MarketScenarios.intradayFresh
        val text = SummaryTextBuilder.buildQuoteSummaryLine(s.quotes[0], s.now)

        assertTrue(text.contains("GMOPG"))
        assertTrue(text.contains("現在値"))
        assertTrue(text.contains("9,920円"))
        assertFalse(text.contains("終値"))
        assertFalse(text.contains("やや遅延"))
        assertFalse(text.contains("更新注意"))
    }

    @Test
    fun `2 場中 30 分前 intraday → 現在値 にならず 時点 + やや遅延`() {
        val s = MarketScenarios.intradayLagging
        val text = SummaryTextBuilder.buildQuoteSummaryLine(s.quotes[0], s.now)

        assertTrue(text.contains("GMOPG"))
        assertFalse(text.contains("現在値"))
        assertTrue(text.contains("時点"))
        assertTrue(text.contains("やや遅延"))
        assertFalse(text.contains("更新注意"))
    }

    @Test
    fun `3 close → 終値 が出る, 現在値 は出ない`() {
        val s = MarketScenarios.weekdayMorningCloseNav
        val text = SummaryTextBuilder.buildQuoteSummaryLine(s.quotes[0], s.now) // GMOPG close

        assertTrue(text.contains("終値"))
        assertFalse(text.contains("現在値"))
    }

    @Test
    fun `4 nav → 基準価額 が出る, 現在値 は出ない`() {
        val s = MarketScenarios.weekdayMorningCloseNav
        val text = SummaryTextBuilder.buildQuoteSummaryLine(s.quotes[1], s.now) // AB nav

        assertTrue(text.contains("AB"))
        assertTrue(text.contains("基準価額"))
        assertFalse(text.contains("現在値"))
    }

    @Test
    fun `5 前営業日以前 intraday → 更新注意 が付く, 現在値 は出ない`() {
        val s = MarketScenarios.staleWithCandidateBlock
        val text = SummaryTextBuilder.buildQuoteSummaryLine(s.quotes[0], s.now) // stale GMOPG

        assertTrue(text.contains("更新注意"))
        assertFalse(text.contains("現在値"))
    }

    // ─── CandidateReasonTextBuilder ───────────────────────────────────────────

    @Test
    fun `6 MARKET_CONTEXT_MISSING → 市場コンテキスト未同期`() {
        assertTrue(CandidateReasonTextBuilder.build(CandidateBlockReason.MARKET_CONTEXT_MISSING)
            .contains("市場コンテキスト未同期"))
    }

    @Test
    fun `7 STALE_MARKET_DATA → 価格鮮度`() {
        assertTrue(CandidateReasonTextBuilder.build(CandidateBlockReason.STALE_MARKET_DATA)
            .contains("価格鮮度"))
    }

    @Test
    fun `8 SCORE_BELOW_THRESHOLD → 閾値`() {
        assertTrue(CandidateReasonTextBuilder.build(CandidateBlockReason.SCORE_BELOW_THRESHOLD)
            .contains("閾値"))
    }

    // ─── buildFetchStatusText ─────────────────────────────────────────────────

    @Test
    fun `9 FAILED + lastSuccessAt あり → 前回取得分を表示`() {
        val fs = SnapshotFetchState(
            status        = SnapshotFetchState.FetchStatus.FAILED,
            errorKind     = SnapshotFetchErrorKind.NETWORK,
            fallbackUsed  = true,
            lastSuccessAt = "${TODAY}T09:00:00+09:00",
        )
        assertTrue(SummaryTextBuilder.buildFetchStatusText(fs).contains("前回取得分を表示"))
    }

    @Test
    fun `10 FAILED + lastSuccessAt なし → 初回取得前`() {
        val fs = SnapshotFetchState(
            status       = SnapshotFetchState.FetchStatus.FAILED,
            errorKind    = SnapshotFetchErrorKind.NETWORK,
            fallbackUsed = true,
        )
        assertTrue(SummaryTextBuilder.buildFetchStatusText(fs).contains("初回取得前"))
    }

    @Test
    fun `11 SUCCESS → 空文字 (状態行なし)`() {
        val fs = SnapshotFetchState(
            status        = SnapshotFetchState.FetchStatus.SUCCESS,
            fallbackUsed  = false,
            lastSuccessAt = "${TODAY}T09:00:00+09:00",
        )
        assertEquals("", SummaryTextBuilder.buildFetchStatusText(fs))
    }

    @Test
    fun `12 IDLE → 空文字 (状態行なし)`() {
        val fs = SnapshotFetchState(
            status       = SnapshotFetchState.FetchStatus.IDLE,
            fallbackUsed = false,
        )
        assertEquals("", SummaryTextBuilder.buildFetchStatusText(fs))
    }

    // ─── generateSummaryText ─────────────────────────────────────────────────

    @Test
    fun `13 fetch 失敗 + candidateBlockReason が 3 行で出る`() {
        val s = MarketScenarios.weekdayMorningCloseNav
        val fs = SnapshotFetchState(
            status        = SnapshotFetchState.FetchStatus.FAILED,
            errorKind     = SnapshotFetchErrorKind.NETWORK,
            fallbackUsed  = true,
            lastSuccessAt = "${TODAY}T09:00:00+09:00",
        )
        val text = SummaryTextBuilder.generateSummaryText(
            quotes               = s.quotes,
            now                  = s.now,
            fetchStatus          = fs,
            candidateBlockReason = CandidateBlockReason.MARKET_CONTEXT_MISSING,
        )

        assertTrue(text.contains("終値"))
        assertTrue(text.contains("前回取得分を表示"))
        assertTrue(text.contains("市場コンテキスト未同期"))

        val lines = text.split("\n")
        assertTrue(lines.size >= 3)
        // 順序: 価格行 → 状態行 → 候補理由行
        val priceIdx  = lines.indexOfFirst { it.contains("終値") }
        val statusIdx = lines.indexOfFirst { it.contains("前回取得分") }
        val reasonIdx = lines.indexOfFirst { it.contains("市場コンテキスト未同期") }
        assertTrue(statusIdx > priceIdx)
        assertTrue(reasonIdx > statusIdx)
    }

    @Test
    fun `14 fetch 成功 → 状態行が出ない`() {
        val s = MarketScenarios.weekdayMorningCloseNav
        val fs = SnapshotFetchState(
            status        = SnapshotFetchState.FetchStatus.SUCCESS,
            fallbackUsed  = false,
            lastSuccessAt = "${TODAY}T09:00:00+09:00",
        )
        val text = SummaryTextBuilder.generateSummaryText(s.quotes, s.now, fs)

        assertFalse(text.contains("前回取得分"))
        assertFalse(text.contains("取得できません"))
    }

    @Test
    fun `15 fetchStatus 未指定 → 状態行なし (既存互換)`() {
        val s = MarketScenarios.weekdayMorningCloseNav
        val text = SummaryTextBuilder.generateSummaryText(s.quotes, s.now)

        assertFalse(text.contains("前回取得分"))
    }

    // ─── fixture expectedFragments 網羅チェック ────────────────────────────────

    @Test
    fun `fixture 全シナリオ expectedInclude が出る`() {
        for (s in MarketScenarios.all) {
            val text = SummaryTextBuilder.generateSummaryText(
                quotes               = s.quotes,
                now                  = s.now,
                candidateBlockReason = s.candidateBlockReason,
            )
            for (fragment in s.expectedInclude) {
                assertTrue(text.contains(fragment),
                    "シナリオで '$fragment' が見つからない。テキスト:\n$text")
            }
        }
    }

    @Test
    fun `fixture 全シナリオ expectedExclude が出ない`() {
        for (s in MarketScenarios.all) {
            val text = SummaryTextBuilder.generateSummaryText(
                quotes               = s.quotes,
                now                  = s.now,
                candidateBlockReason = s.candidateBlockReason,
            )
            for (fragment in s.expectedExclude) {
                assertFalse(text.contains(fragment),
                    "シナリオで '$fragment' が出てはいけない。テキスト:\n$text")
            }
        }
    }

    // ─── 現在値混入防止 (全シナリオ横断) ─────────────────────────────────────

    @Test
    fun `現在値 は fresh intraday シナリオにだけ出る`() {
        // 現在値が出るべきシナリオ
        val freshText = SummaryTextBuilder.generateSummaryText(
            MarketScenarios.intradayFresh.quotes,
            MarketScenarios.intradayFresh.now,
        )
        assertTrue(freshText.contains("現在値"))

        // 現在値が出てはいけないシナリオ
        for (s in listOf(
            MarketScenarios.weekdayMorningCloseNav,
            MarketScenarios.intradayLagging,
            MarketScenarios.staleWithCandidateBlock,
            MarketScenarios.mixedNoCurrentLeak,
        )) {
            val text = SummaryTextBuilder.generateSummaryText(s.quotes, s.now)
            assertFalse(text.contains("現在値"),
                "シナリオ ${s.now} で 現在値 が出てはいけない。テキスト:\n$text")
        }
    }
}
