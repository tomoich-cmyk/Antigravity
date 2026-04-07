package com.antigravity.engine.fixtures

import com.antigravity.contract.*
import java.time.ZonedDateTime

/**
 * テスト共通シナリオ — Web 側 marketScenarios.ts の Kotlin 移植。
 *
 * 基準日:
 *   TODAY    = 2026-04-06 (月)
 *   PREV_BIZ = 2026-04-03 (金)
 *
 * シナリオ一覧:
 *   weekdayMorningCloseNav   平日朝 08:30 JST — close + nav (前営業日終値 / 基準価額)
 *   intradayFresh            平日前場 10:00 JST — intraday 10 分前 (現在値)
 *   intradayLagging          平日前場 10:40 JST — intraday 30 分前 (やや遅延)
 *   staleWithCandidateBlock  平日前場 09:30 JST — stale 混在 + market_context_missing
 *   mixedNoCurrentLeak       平日前場 09:30 JST — close/nav/reference 混在 (現在値ゼロ)
 */
object MarketScenarios {

    const val TODAY    = "2026-04-06"
    const val PREV_BIZ = "2026-04-03"

    // ─── ファクトリ ───────────────────────────────────────────────────────────

    fun makeStock(
        assetId: String = "GMOPG",
        quoteKind: QuoteKind = QuoteKind.CLOSE,
        baselineDate: String = PREV_BIZ,
        marketDataAt: String? = "${PREV_BIZ}T15:30:00+09:00",
        value: Double = 9850.0,
    ) = QuoteSnapshot(
        assetId      = assetId,
        assetClass   = AssetClass.JP_STOCK,
        value        = value,
        currency     = "JPY",
        quoteKind    = quoteKind,
        source       = QuoteSource(SourceId.SNAPSHOT_SERVER, SourceMode.EOD, "Snapshot Server"),
        syncedAt     = "${TODAY}T08:01:00+09:00",
        marketDataAt = marketDataAt,
        baselineDate = baselineDate,
    )

    fun makeFund(
        assetId: String = "AB",
        quoteKind: QuoteKind = QuoteKind.NAV,
        baselineDate: String = PREV_BIZ,
        marketDataAt: String? = null,
        value: Double = 9117.0,
    ) = QuoteSnapshot(
        assetId      = assetId,
        assetClass   = AssetClass.MUTUAL_FUND,
        value        = value,
        currency     = "JPY",
        quoteKind    = quoteKind,
        source       = QuoteSource(SourceId.BROKER_IMPORT, SourceMode.DAILY_NAV, "Broker Import"),
        syncedAt     = "${TODAY}T08:01:00+09:00",
        marketDataAt = marketDataAt,
        baselineDate = baselineDate,
    )

    // ─── シナリオ ─────────────────────────────────────────────────────────────

    data class Scenario(
        val now: ZonedDateTime,
        val quotes: List<QuoteSnapshot>,
        val candidateBlockReason: CandidateBlockReason? = null,
        val expectedInclude: List<String>,
        val expectedExclude: List<String>,
    )

    /** S1: 平日朝 08:30 — close + nav */
    val weekdayMorningCloseNav = Scenario(
        now    = ZonedDateTime.parse("${TODAY}T08:30:00+09:00"),
        quotes = listOf(
            makeStock(quoteKind = QuoteKind.CLOSE, baselineDate = PREV_BIZ),
            makeFund(quoteKind  = QuoteKind.NAV,   baselineDate = PREV_BIZ),
        ),
        expectedInclude = listOf("終値", "基準価額"),
        expectedExclude = listOf("現在値", "やや遅延", "更新注意"),
    )

    /** S2: 場中 fresh 10:00 — intraday 10 分前 */
    val intradayFresh = Scenario(
        now    = ZonedDateTime.parse("${TODAY}T10:00:00+09:00"),
        quotes = listOf(
            makeStock(
                quoteKind    = QuoteKind.INTRADAY,
                baselineDate = TODAY,
                marketDataAt = "${TODAY}T09:50:00+09:00",
                value        = 9920.0,
            ),
        ),
        expectedInclude = listOf("現在値"),
        expectedExclude = listOf("終値", "基準価額", "やや遅延", "更新注意"),
    )

    /** S3: 場中 lagging 10:40 — intraday 30 分前 */
    val intradayLagging = Scenario(
        now    = ZonedDateTime.parse("${TODAY}T10:40:00+09:00"),
        quotes = listOf(
            makeStock(
                quoteKind    = QuoteKind.INTRADAY,
                baselineDate = TODAY,
                marketDataAt = "${TODAY}T10:10:00+09:00",
                value        = 9870.0,
            ),
        ),
        expectedInclude = listOf("時点", "やや遅延"),
        expectedExclude = listOf("現在値", "更新注意"),
    )

    /** S4: stale 混在 + market_context_missing 09:30 */
    val staleWithCandidateBlock = Scenario(
        now    = ZonedDateTime.parse("${TODAY}T09:30:00+09:00"),
        quotes = listOf(
            makeStock(
                quoteKind    = QuoteKind.INTRADAY,
                baselineDate = PREV_BIZ,
                marketDataAt = "${PREV_BIZ}T10:00:00+09:00",
                value        = 9800.0,
            ),
            makeFund(quoteKind = QuoteKind.NAV, baselineDate = PREV_BIZ),
        ),
        candidateBlockReason = CandidateBlockReason.MARKET_CONTEXT_MISSING,
        expectedInclude = listOf("更新注意", "基準価額", "市場コンテキスト未同期"),
        expectedExclude = listOf("現在値"),
    )

    /** S5: close + nav + reference 混在 — 現在値ゼロ確認 */
    val mixedNoCurrentLeak = Scenario(
        now    = ZonedDateTime.parse("${TODAY}T09:30:00+09:00"),
        quotes = listOf(
            makeStock(assetId = "GMOPG", quoteKind = QuoteKind.CLOSE,     baselineDate = PREV_BIZ),
            makeFund( assetId = "AB",    quoteKind = QuoteKind.NAV,       baselineDate = PREV_BIZ),
            makeFund( assetId = "REF",   quoteKind = QuoteKind.REFERENCE, baselineDate = PREV_BIZ),
        ),
        expectedInclude = listOf("終値", "基準価額", "参考"),
        expectedExclude = listOf("現在値"),
    )

    val all = listOf(
        weekdayMorningCloseNav,
        intradayFresh,
        intradayLagging,
        staleWithCandidateBlock,
        mixedNoCurrentLeak,
    )
}
