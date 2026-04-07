package com.antigravity.engine

import com.antigravity.contract.*
import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit

/**
 * QuoteSnapshot の鮮度を評価し FreshnessView を返す — Web 側 freshness.ts の Kotlin 移植。
 *
 * quoteKind 別の評価ロジック:
 *   INTRADAY  → evaluateIntraday
 *   CLOSE     → evaluateClose
 *   NAV       → evaluateNav
 *   REFERENCE → evaluateReference
 *
 * 不変条件:
 *   canPretendCurrent=true になれるのは MORNING / AFTERNOON セッション中の
 *   INTRADAY 20 分以内のみ。それ以外は常に false。
 */
object FreshnessEvaluator {

    /**
     * @param quote   対象スナップショット
     * @param now     判定基準時刻 (省略時 = システム時刻)
     * @param isHoliday 祝日判定関数 (省略時 = JapanHolidayProvider)
     */
    fun evaluate(
        quote: QuoteSnapshot,
        now: ZonedDateTime = ZonedDateTime.now(MarketClock.JST),
        isHoliday: (String) -> Boolean = JapanHolidayProvider,
    ): FreshnessView = when (quote.quoteKind) {
        QuoteKind.INTRADAY  -> evaluateIntraday(quote, now, isHoliday)
        QuoteKind.CLOSE     -> evaluateClose(quote, now, isHoliday)
        QuoteKind.NAV       -> evaluateNav(quote, now, isHoliday)
        QuoteKind.REFERENCE -> evaluateReference(quote, now, isHoliday)
    }

    // ─── INTRADAY ─────────────────────────────────────────────────────────────
    private fun evaluateIntraday(
        quote: QuoteSnapshot,
        now: ZonedDateTime,
        isHoliday: (String) -> Boolean,
    ): FreshnessView {
        val session  = MarketClock.getSession(now, isHoliday)
        val nowJst   = MarketClock.parseJst(now.toString())
        val todayYmd = nowJst.toLocalDate().toString()

        // marketDataAt がなければ syncedAt で代替
        val dataTimeStr = quote.marketDataAt ?: quote.syncedAt
        val dataTime    = MarketClock.parseJst(dataTimeStr)
        val dataYmd     = dataTime.toLocalDate().toString()

        // 前営業日以前 → stale
        if (dataYmd < todayYmd) {
            val label = "${MarketClock.formatMd(dataTime)} 前営業日"
            return view(
                isStale = true, level = FreshnessLevel.STALE,
                asOfLabel = label, priceLabel = "取得値",
                canPretendCurrent = false,
                reason = FreshnessReason.PROVIDER_DELAY,
                message = "前日以前のデータです。手動更新してください。",
            )
        }

        // 場外 (after_close / holiday)
        if (session == MarketSession.AFTER_CLOSE || session == MarketSession.HOLIDAY) {
            return if (dataYmd == todayYmd) {
                val label = if (quote.marketDataAt != null)
                    "${MarketClock.formatMdHm(dataTime)} 終値"
                else
                    "${MarketClock.formatMd(nowJst)} 終値"
                view(
                    isStale = false, level = FreshnessLevel.FRESH,
                    asOfLabel = label, priceLabel = "終値",
                    canPretendCurrent = false,
                    reason = FreshnessReason.MARKET_CLOSED,
                    message = "市場は閉場中です。",
                )
            } else {
                val label = if (dataYmd.isNotEmpty()) "${MarketClock.formatMd(dataTime)} 前日終値" else "—"
                view(
                    isStale = true, level = FreshnessLevel.STALE,
                    asOfLabel = label, priceLabel = "取得値",
                    canPretendCurrent = false,
                    reason = FreshnessReason.PROVIDER_DELAY,
                    message = "市場は閉場中です。",
                )
            }
        }

        // 場中 (morning / afternoon)
        if (session == MarketSession.MORNING || session == MarketSession.AFTERNOON) {
            if (quote.marketDataAt == null) {
                return view(
                    isStale = false, level = FreshnessLevel.UNKNOWN,
                    asOfLabel = "${MarketClock.formatMd(nowJst)} 時刻不明", priceLabel = "取得値",
                    canPretendCurrent = false,
                    reason = FreshnessReason.MISSING_MARKET_TIME,
                )
            }
            val mins = ChronoUnit.MINUTES.between(dataTime, nowJst)
            return when {
                mins <= 20 -> view(
                    isStale = false, level = FreshnessLevel.FRESH,
                    asOfLabel = "${MarketClock.formatMdHm(dataTime)} 時点", priceLabel = "現在値",
                    canPretendCurrent = true,
                )
                mins <= 60 -> view(
                    isStale = false, level = FreshnessLevel.LAGGING,
                    asOfLabel = "${MarketClock.formatMdHm(dataTime)} 時点 (遅延)", priceLabel = "${MarketClock.formatMdHm(dataTime)} 時点",
                    canPretendCurrent = false,
                    reason = FreshnessReason.PROVIDER_DELAY,
                    message = "${mins}分前のデータです。",
                )
                else -> view(
                    isStale = true, level = FreshnessLevel.STALE,
                    asOfLabel = "${MarketClock.formatMdHm(dataTime)} 時点", priceLabel = "取得値",
                    canPretendCurrent = false,
                    reason = FreshnessReason.PROVIDER_DELAY,
                    message = "${mins}分前のデータです。更新してください。",
                )
            }
        }

        // pre_open / lunch_break: 直前セッション終値として扱う
        return if (quote.marketDataAt != null) {
            view(
                isStale = false, level = FreshnessLevel.FRESH,
                asOfLabel = "${MarketClock.formatMdHm(dataTime)} 時点", priceLabel = "取得値",
                canPretendCurrent = false,
                reason = FreshnessReason.MARKET_CLOSED,
            )
        } else {
            view(
                isStale = false, level = FreshnessLevel.UNKNOWN,
                asOfLabel = "${MarketClock.formatMd(nowJst)} 時刻不明", priceLabel = "取得値",
                canPretendCurrent = false,
                reason = FreshnessReason.MISSING_MARKET_TIME,
            )
        }
    }

    // ─── CLOSE ────────────────────────────────────────────────────────────────
    /**
     * - baselineDate が当日 or 前営業日 (diff ≤ 1) → fresh
     * - diff ≥ 2 → stale
     */
    private fun evaluateClose(
        quote: QuoteSnapshot,
        now: ZonedDateTime,
        isHoliday: (String) -> Boolean,
    ): FreshnessView {
        val todayYmd = now.withZoneSameInstant(MarketClock.JST).toLocalDate().toString()
        val baseline = quote.baselineDate
        val baseDate = MarketClock.parseJst("${baseline}T00:00:00+09:00")
        val label    = "${MarketClock.formatMd(baseDate)} 終値"
        val diff     = MarketClock.businessDayDiff(baseline, todayYmd, isHoliday)

        return when {
            diff <= 1 -> view(
                isStale = false, level = FreshnessLevel.FRESH,
                asOfLabel = label, priceLabel = "終値",
                canPretendCurrent = false,
                reason = if (diff == 1) FreshnessReason.MARKET_CLOSED else null,
                message = if (diff == 1) "前営業日の確定終値です。" else null,
            )
            else -> view(
                isStale = true, level = FreshnessLevel.STALE,
                asOfLabel = label, priceLabel = "終値",
                canPretendCurrent = false,
                reason = FreshnessReason.PROVIDER_DELAY,
                message = "${diff}営業日前の終値です。",
            )
        }
    }

    // ─── NAV ──────────────────────────────────────────────────────────────────
    /**
     * - diff ≤ 1 → fresh
     * - diff == 2 → lagging (祝日挟み)
     * - diff ≥ 3 → stale
     */
    private fun evaluateNav(
        quote: QuoteSnapshot,
        now: ZonedDateTime,
        isHoliday: (String) -> Boolean,
    ): FreshnessView {
        val todayYmd = now.withZoneSameInstant(MarketClock.JST).toLocalDate().toString()
        val baseline = quote.baselineDate
        val baseDate = MarketClock.parseJst("${baseline}T00:00:00+09:00")
        val label    = "${MarketClock.formatMd(baseDate)} 基準価額"
        val diff     = MarketClock.businessDayDiff(baseline, todayYmd, isHoliday)

        return when {
            diff <= 1 -> view(
                isStale = false, level = FreshnessLevel.FRESH,
                asOfLabel = label, priceLabel = "基準価額",
                canPretendCurrent = false,
            )
            diff == 2 -> view(
                isStale = false, level = FreshnessLevel.LAGGING,
                asOfLabel = label, priceLabel = "基準価額",
                canPretendCurrent = false,
                reason = FreshnessReason.HOLIDAY_GAP,
                message = "祝日をまたいでいる可能性があります。",
            )
            else -> view(
                isStale = true, level = FreshnessLevel.STALE,
                asOfLabel = label, priceLabel = "基準価額",
                canPretendCurrent = false,
                reason = FreshnessReason.NAV_NOT_UPDATED,
                message = "${diff}営業日前の基準価額です。更新してください。",
            )
        }
    }

    // ─── REFERENCE ────────────────────────────────────────────────────────────
    /**
     * reference は常に lagging 以上 (未確定値)
     * - diff ≤ 1 → lagging
     * - diff ≥ 2 → stale
     */
    private fun evaluateReference(
        quote: QuoteSnapshot,
        now: ZonedDateTime,
        isHoliday: (String) -> Boolean,
    ): FreshnessView {
        val todayYmd = now.withZoneSameInstant(MarketClock.JST).toLocalDate().toString()
        val baseline = quote.baselineDate
        val baseDate = MarketClock.parseJst("${baseline}T00:00:00+09:00")
        val label    = "${MarketClock.formatMd(baseDate)} 参考"
        val diff     = MarketClock.businessDayDiff(baseline, todayYmd, isHoliday)

        return when {
            diff <= 1 -> view(
                isStale = false, level = FreshnessLevel.LAGGING,
                asOfLabel = label, priceLabel = "参考",
                canPretendCurrent = false,
                reason = FreshnessReason.MARKET_CLOSED,
                message = "参考価格です（未確定）。",
            )
            else -> view(
                isStale = true, level = FreshnessLevel.STALE,
                asOfLabel = label, priceLabel = "参考",
                canPretendCurrent = false,
                reason = FreshnessReason.NAV_NOT_UPDATED,
                message = "${diff}営業日前の参考価格です。",
            )
        }
    }

    // ─── ヘルパー ─────────────────────────────────────────────────────────────
    private fun view(
        isStale: Boolean,
        level: FreshnessLevel,
        asOfLabel: String,
        priceLabel: String,
        canPretendCurrent: Boolean,
        reason: FreshnessReason? = null,
        message: String? = null,
    ) = FreshnessView(
        isStale = isStale,
        level = level,
        reason = reason,
        asOfLabel = asOfLabel,
        priceLabel = priceLabel,
        canPretendCurrent = canPretendCurrent,
        message = message,
    )
}
