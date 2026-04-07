package com.antigravity.engine

import com.antigravity.contract.*
import com.antigravity.engine.fixtures.MarketScenarios
import com.antigravity.engine.fixtures.MarketScenarios.PREV_BIZ
import com.antigravity.engine.fixtures.MarketScenarios.TODAY
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.time.ZonedDateTime

class FreshnessEvaluatorTest {

    // ─── INTRADAY ─────────────────────────────────────────────────────────────

    @Test
    fun `1 平日朝 marketDataAt が前営業日 → stale`() {
        val quote = MarketScenarios.makeStock(
            quoteKind    = QuoteKind.INTRADAY,
            baselineDate = PREV_BIZ,
            marketDataAt = "${PREV_BIZ}T10:00:00+09:00",
        )
        val now = ZonedDateTime.parse("${TODAY}T09:30:00+09:00")
        val fv = FreshnessEvaluator.evaluate(quote, now)

        assertEquals(FreshnessLevel.STALE, fv.level)
        assertFalse(fv.canPretendCurrent)
        assertTrue(fv.isStale)
        assertNotEquals("現在値", fv.priceLabel)
    }

    @Test
    fun `2 場中 marketDataAt が 15 分前 → fresh, canPretendCurrent=true`() {
        val quote = MarketScenarios.makeStock(
            quoteKind    = QuoteKind.INTRADAY,
            baselineDate = TODAY,
            marketDataAt = "${TODAY}T09:45:00+09:00",
        )
        val now = ZonedDateTime.parse("${TODAY}T10:00:00+09:00")
        val fv = FreshnessEvaluator.evaluate(quote, now)

        assertEquals(FreshnessLevel.FRESH, fv.level)
        assertTrue(fv.canPretendCurrent)
        assertFalse(fv.isStale)
        assertEquals("現在値", fv.priceLabel)
    }

    @Test
    fun `3 場中 marketDataAt が 45 分前 → lagging, canPretendCurrent=false`() {
        val quote = MarketScenarios.makeStock(
            quoteKind    = QuoteKind.INTRADAY,
            baselineDate = TODAY,
            marketDataAt = "${TODAY}T10:10:00+09:00",
        )
        val now = ZonedDateTime.parse("${TODAY}T10:55:00+09:00")
        val fv = FreshnessEvaluator.evaluate(quote, now)

        assertEquals(FreshnessLevel.LAGGING, fv.level)
        assertFalse(fv.canPretendCurrent)
        assertFalse(fv.isStale)
        assertNotEquals("現在値", fv.priceLabel)
    }

    @Test
    fun `4 場中 marketDataAt が 2 時間前 → stale`() {
        val quote = MarketScenarios.makeStock(
            quoteKind    = QuoteKind.INTRADAY,
            baselineDate = TODAY,
            marketDataAt = "${TODAY}T09:00:00+09:00",
        )
        val now = ZonedDateTime.parse("${TODAY}T11:00:00+09:00")
        val fv = FreshnessEvaluator.evaluate(quote, now)

        assertEquals(FreshnessLevel.STALE, fv.level)
        assertFalse(fv.canPretendCurrent)
        assertTrue(fv.isStale)
    }

    @Test
    fun `5 marketDataAt が null → UNKNOWN, canPretendCurrent=false`() {
        val quote = MarketScenarios.makeStock(
            quoteKind    = QuoteKind.INTRADAY,
            baselineDate = TODAY,
            marketDataAt = null,
        )
        val now = ZonedDateTime.parse("${TODAY}T10:00:00+09:00")
        val fv = FreshnessEvaluator.evaluate(quote, now)

        assertEquals(FreshnessLevel.UNKNOWN, fv.level)
        assertFalse(fv.canPretendCurrent)
    }

    // ─── CLOSE ────────────────────────────────────────────────────────────────

    @Test
    fun `6 当日終値 (after_close 15時45分) → fresh`() {
        val quote = MarketScenarios.makeStock(
            quoteKind    = QuoteKind.CLOSE,
            baselineDate = TODAY,
        )
        val now = ZonedDateTime.parse("${TODAY}T15:45:00+09:00")
        val fv = FreshnessEvaluator.evaluate(quote, now)

        assertEquals(FreshnessLevel.FRESH, fv.level)
        assertFalse(fv.canPretendCurrent)
        assertEquals("終値", fv.priceLabel)
    }

    @Test
    fun `7 前営業日終値 (翌朝 8時) → fresh`() {
        val quote = MarketScenarios.makeStock(
            quoteKind    = QuoteKind.CLOSE,
            baselineDate = PREV_BIZ,
        )
        val now = ZonedDateTime.parse("${TODAY}T08:00:00+09:00")
        val fv = FreshnessEvaluator.evaluate(quote, now)

        assertEquals(FreshnessLevel.FRESH, fv.level)
        assertFalse(fv.canPretendCurrent)
        assertEquals("終値", fv.priceLabel)
    }

    @Test
    fun `8 3 営業日前終値 → stale`() {
        val quote = MarketScenarios.makeStock(
            quoteKind    = QuoteKind.CLOSE,
            baselineDate = "2026-03-31", // 3 営業日前
        )
        val now = ZonedDateTime.parse("${TODAY}T08:30:00+09:00")
        val fv = FreshnessEvaluator.evaluate(quote, now)

        assertEquals(FreshnessLevel.STALE, fv.level)
        assertTrue(fv.isStale)
        assertEquals("終値", fv.priceLabel)
    }

    // ─── NAV ──────────────────────────────────────────────────────────────────

    @Test
    fun `9 前営業日基準価額 → fresh`() {
        val quote = MarketScenarios.makeFund(
            quoteKind    = QuoteKind.NAV,
            baselineDate = PREV_BIZ,
        )
        val now = ZonedDateTime.parse("${TODAY}T08:30:00+09:00")
        val fv = FreshnessEvaluator.evaluate(quote, now)

        assertEquals(FreshnessLevel.FRESH, fv.level)
        assertFalse(fv.canPretendCurrent)
        assertEquals("基準価額", fv.priceLabel)
    }

    @Test
    fun `10 2 営業日前基準価額 → lagging`() {
        // 2026-04-06 から 2 営業日前 = 2026-04-02 (木)
        val quote = MarketScenarios.makeFund(
            quoteKind    = QuoteKind.NAV,
            baselineDate = "2026-04-02",
        )
        val now = ZonedDateTime.parse("${TODAY}T08:30:00+09:00")
        val fv = FreshnessEvaluator.evaluate(quote, now)

        assertEquals(FreshnessLevel.LAGGING, fv.level)
        assertFalse(fv.canPretendCurrent)
        assertEquals("基準価額", fv.priceLabel)
    }

    @Test
    fun `11 4 営業日前基準価額 → stale`() {
        // 2026-04-06 から 4 営業日前 = 2026-03-31 (火)
        val quote = MarketScenarios.makeFund(
            quoteKind    = QuoteKind.NAV,
            baselineDate = "2026-03-31",
        )
        val now = ZonedDateTime.parse("${TODAY}T08:30:00+09:00")
        val fv = FreshnessEvaluator.evaluate(quote, now)

        assertEquals(FreshnessLevel.STALE, fv.level)
        assertTrue(fv.isStale)
        assertEquals("基準価額", fv.priceLabel)
    }

    // ─── REFERENCE ────────────────────────────────────────────────────────────

    @Test
    fun `12 前営業日参考価格 → lagging`() {
        val quote = MarketScenarios.makeFund(
            quoteKind    = QuoteKind.REFERENCE,
            baselineDate = PREV_BIZ,
        )
        val now = ZonedDateTime.parse("${TODAY}T08:30:00+09:00")
        val fv = FreshnessEvaluator.evaluate(quote, now)

        assertEquals(FreshnessLevel.LAGGING, fv.level)
        assertFalse(fv.canPretendCurrent)
        assertEquals("参考", fv.priceLabel)
    }

    @Test
    fun `13 3 営業日前参考価格 → stale`() {
        val quote = MarketScenarios.makeFund(
            quoteKind    = QuoteKind.REFERENCE,
            baselineDate = "2026-03-31",
        )
        val now = ZonedDateTime.parse("${TODAY}T08:30:00+09:00")
        val fv = FreshnessEvaluator.evaluate(quote, now)

        assertEquals(FreshnessLevel.STALE, fv.level)
        assertTrue(fv.isStale)
    }

    // ─── canPretendCurrent 不変条件 ───────────────────────────────────────────

    @Test
    fun `14 場中 10 分前 intraday → canPretendCurrent=true, priceLabel=現在値`() {
        val quote = MarketScenarios.makeStock(
            quoteKind    = QuoteKind.INTRADAY,
            baselineDate = TODAY,
            marketDataAt = "${TODAY}T09:50:00+09:00",
        )
        val now = ZonedDateTime.parse("${TODAY}T10:00:00+09:00")
        val fv = FreshnessEvaluator.evaluate(quote, now)

        assertTrue(fv.canPretendCurrent)
        assertEquals("現在値", fv.priceLabel)
    }

    @Test
    fun `15 場中 40 分前 intraday → canPretendCurrent=false, priceLabel≠現在値`() {
        val quote = MarketScenarios.makeStock(
            quoteKind    = QuoteKind.INTRADAY,
            baselineDate = TODAY,
            marketDataAt = "${TODAY}T10:00:00+09:00",
        )
        val now = ZonedDateTime.parse("${TODAY}T10:40:00+09:00")
        val fv = FreshnessEvaluator.evaluate(quote, now)

        assertFalse(fv.canPretendCurrent)
        assertNotEquals("現在値", fv.priceLabel)
    }

    @Test
    fun `16 close → canPretendCurrent=false, priceLabel=終値`() {
        val quote = MarketScenarios.makeStock(
            quoteKind    = QuoteKind.CLOSE,
            baselineDate = TODAY,
        )
        val now = ZonedDateTime.parse("${TODAY}T15:45:00+09:00")
        val fv = FreshnessEvaluator.evaluate(quote, now)

        assertFalse(fv.canPretendCurrent)
        assertEquals("終値", fv.priceLabel)
    }

    @Test
    fun `17 nav → canPretendCurrent=false, priceLabel=基準価額`() {
        val quote = MarketScenarios.makeFund(
            quoteKind    = QuoteKind.NAV,
            baselineDate = PREV_BIZ,
        )
        val now = ZonedDateTime.parse("${TODAY}T08:30:00+09:00")
        val fv = FreshnessEvaluator.evaluate(quote, now)

        assertFalse(fv.canPretendCurrent)
        assertEquals("基準価額", fv.priceLabel)
    }
}
