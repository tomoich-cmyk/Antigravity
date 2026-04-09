package com.antigravity.app.widget

import com.antigravity.contract.AssetClass
import com.antigravity.contract.QuoteKind
import com.antigravity.contract.QuoteSnapshot
import com.antigravity.contract.QuoteSource
import com.antigravity.contract.SnapshotFetchErrorKind
import com.antigravity.contract.SnapshotFetchState
import com.antigravity.contract.SourceId
import com.antigravity.contract.SourceMode
import com.antigravity.contract.FreshnessLevel
import com.antigravity.data.db.SummaryCacheEntity
import org.junit.Assert.*
import org.junit.Test
import java.time.ZonedDateTime

/**
 * WidgetStateMapper の単体テスト。
 *
 * WidgetStateMapper は純粋関数 (Android 依存なし) なので
 * Robolectric 不要・JVM のみで高速に実行できる。
 *
 * freshness 判定のために now を固定する:
 *   now = 2024-04-08T10:35:00+09:00 (月曜 午前 — 市場オープン中)
 *   intradayQuote.marketDataAt = 2024-04-08T10:30:00+09:00 (5分前) → FRESH
 */
class WidgetStateMapperTest {

    // ─── 固定時刻 ─────────────────────────────────────────────────────────────

    private val now = ZonedDateTime.parse("2024-04-08T10:35:00+09:00")

    // ─── fixtures ─────────────────────────────────────────────────────────────

    /** 5分前に marketDataAt がある INTRADAY 株 → FRESH / canPretendCurrent=true */
    private val intradayQuote = QuoteSnapshot(
        assetId      = "asset-gmopg",
        assetClass   = AssetClass.JP_STOCK,
        value        = 9_920.0,
        currency     = "JPY",
        quoteKind    = QuoteKind.INTRADAY,
        source       = QuoteSource(SourceId.SNAPSHOT_SERVER, SourceMode.REALTIME, "tse"),
        syncedAt     = "2024-04-08T10:30:00+09:00",
        marketDataAt = "2024-04-08T10:30:00+09:00",
        baselineDate = "2024-04-08",
    )

    /** CLOSE 引値 — canPretendCurrent は常に false */
    private val closeQuote = QuoteSnapshot(
        assetId      = "asset-unext",
        assetClass   = AssetClass.JP_STOCK,
        value        = 3_450.0,
        currency     = "JPY",
        quoteKind    = QuoteKind.CLOSE,
        source       = QuoteSource(SourceId.SNAPSHOT_SERVER, SourceMode.EOD, "tse"),
        syncedAt     = "2024-04-08T10:30:00+09:00",
        marketDataAt = null,
        baselineDate = "2024-04-05",
    )

    private fun successStatus(lastSuccessAt: String = "2024-04-08T10:30:00+09:00") =
        SnapshotFetchState(
            status        = SnapshotFetchState.FetchStatus.SUCCESS,
            lastSuccessAt = lastSuccessAt,
        )

    private fun failedStatus(
        fallbackUsed: Boolean = false,
        hasCache: Boolean = false,
        lastSuccessAt: String? = null,
    ) = SnapshotFetchState(
        status                = SnapshotFetchState.FetchStatus.FAILED,
        fallbackUsed          = fallbackUsed,
        hasUsableCachedQuotes = hasCache,
        lastSuccessAt         = lastSuccessAt,
        errorKind             = SnapshotFetchErrorKind.NETWORK,
    )

    private fun summary(text: String) = SummaryCacheEntity(
        summaryText = text,
        generatedAt = "2024-04-08T10:30:00+09:00",
    )

    // ─── summaryLine — empty/initial ──────────────────────────────────────────

    @Test
    fun `null inputs returns データなし and all fields empty`() {
        val state = WidgetStateMapper.map(null, null, emptyList(), now)

        assertEquals("データなし", state.summaryLine)
        assertNull(state.lastSyncAt)
        assertFalse(state.isFailure)
        assertFalse(state.isFallback)
        assertTrue(state.quoteRows.isEmpty())
    }

    @Test
    fun `SUCCESS with summary returns first line of summaryText`() {
        val state = WidgetStateMapper.map(
            summary     = summary("GMO-PG: 現在値 9,920円\n資産合計 xxx"),
            fetchStatus = successStatus(),
            quotes      = listOf(intradayQuote),
            now         = now,
        )

        assertEquals("GMO-PG: 現在値 9,920円", state.summaryLine)
        assertFalse(state.isFailure)
        assertFalse(state.isFallback)
        assertEquals("2024-04-08T10:30:00+09:00", state.lastSyncAt)
    }

    @Test
    fun `SUCCESS with multiline summary trims first line`() {
        val state = WidgetStateMapper.map(
            summary     = summary("  先頭スペース有り  \n2行目"),
            fetchStatus = successStatus(),
            quotes      = emptyList(),
            now         = now,
        )

        assertEquals("先頭スペース有り", state.summaryLine)
    }

    // ─── summaryLine — failure cases ──────────────────────────────────────────

    @Test
    fun `FAILED without fallback returns 取得エラー`() {
        val state = WidgetStateMapper.map(
            summary     = null,
            fetchStatus = failedStatus(fallbackUsed = false),
            quotes      = emptyList(),
            now         = now,
        )

        assertEquals("取得エラー", state.summaryLine)
        assertTrue(state.isFailure)
        assertFalse(state.isFallback)
    }

    @Test
    fun `FAILED with fallback shows cached summary first line`() {
        val state = WidgetStateMapper.map(
            summary     = summary("GMO-PG: 前回値 9,920円\n更新失敗"),
            fetchStatus = failedStatus(
                fallbackUsed  = true,
                hasCache      = true,
                lastSuccessAt = "2024-04-07T15:30:00+09:00",
            ),
            quotes      = listOf(intradayQuote),
            now         = now,
        )

        assertEquals("GMO-PG: 前回値 9,920円", state.summaryLine)
        assertTrue(state.isFailure)
        assertTrue(state.isFallback)
        assertEquals("2024-04-07T15:30:00+09:00", state.lastSyncAt)
    }

    @Test
    fun `FAILED with fallback but no summary falls back to --- not 取得エラー`() {
        // fallbackUsed=true → isFailure && isFallback
        // summary null → summary branch は通らず "---"
        val state = WidgetStateMapper.map(
            summary     = null,
            fetchStatus = failedStatus(fallbackUsed = true, hasCache = true),
            quotes      = listOf(intradayQuote),
            now         = now,
        )

        // isFailure=true だが isFallback=true なので "取得エラー" にはならない
        assertNotEquals("取得エラー", state.summaryLine)
        assertTrue(state.isFailure)
        assertTrue(state.isFallback)
    }

    // ─── quoteRows ────────────────────────────────────────────────────────────

    @Test
    fun `quoteRows are capped at 3 even with more quotes`() {
        val quotes = (1..5).map { i ->
            intradayQuote.copy(assetId = "asset-$i")
        }
        val state = WidgetStateMapper.map(null, null, quotes, now)

        assertEquals(3, state.quoteRows.size)
    }

    @Test
    fun `displayName is mapped correctly for known assets`() {
        val state = WidgetStateMapper.map(
            summary     = null,
            fetchStatus = null,
            quotes      = listOf(intradayQuote, closeQuote),
            now         = now,
        )

        assertEquals("GMO-PG", state.quoteRows[0].displayName)
        assertEquals("U-NEXT", state.quoteRows[1].displayName)
    }

    @Test
    fun `price is formatted with comma and 円 suffix`() {
        val state = WidgetStateMapper.map(null, null, listOf(intradayQuote), now)
        val row = state.quoteRows.first()

        assertTrue("price should end with 円", row.price.endsWith("円"))
        assertTrue("price should contain comma", row.price.contains(","))
        assertEquals("9,920円", row.price)
    }

    // ─── freshness / timeLabel ────────────────────────────────────────────────

    @Test
    fun `fresh intraday quote shows 現在値 as timeLabel`() {
        // now は marketDataAt の 5 分後 → FRESH → canPretendCurrent=true
        val state = WidgetStateMapper.map(null, null, listOf(intradayQuote), now)
        val row = state.quoteRows.first()

        assertEquals("現在値", row.timeLabel)
        assertEquals(FreshnessLevel.FRESH, row.freshnessLevel)
    }

    @Test
    fun `CLOSE quote never shows 現在値`() {
        val state = WidgetStateMapper.map(null, null, listOf(closeQuote), now)
        val row = state.quoteRows.first()

        assertNotEquals("現在値", row.timeLabel)
        assertTrue("timeLabel must not be blank", row.timeLabel.isNotBlank())
    }

    @Test
    fun `stale intraday quote shows asOfLabel not 現在値`() {
        // marketDataAt が 1日以上前 → STALE
        val staleQuote = intradayQuote.copy(
            marketDataAt = "2024-04-07T10:30:00+09:00",  // 前日
            syncedAt     = "2024-04-07T10:30:00+09:00",
        )
        val state = WidgetStateMapper.map(null, null, listOf(staleQuote), now)
        val row = state.quoteRows.first()

        assertNotEquals("現在値", row.timeLabel)
        assertNotEquals(FreshnessLevel.FRESH, row.freshnessLevel)
    }
}
