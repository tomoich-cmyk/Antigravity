package com.antigravity.engine

import com.antigravity.contract.MarketSession
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

/**
 * 東京市場の時刻・セッション・営業日ヘルパー — Web 側 marketClock.ts の Kotlin 移植。
 *
 * TSE スケジュール (2024-11-05〜)
 *   前場: 09:00〜11:30
 *   後場: 12:30〜15:30
 */
object MarketClock {

    val JST: ZoneId = ZoneId.of("Asia/Tokyo")

    private val MORNING_START   = LocalTime.of(9,  0)
    private val MORNING_END     = LocalTime.of(11, 30)
    private val AFTERNOON_START = LocalTime.of(12, 30)
    private val AFTERNOON_END   = LocalTime.of(15, 30)
    private val PRE_OPEN_START  = LocalTime.of(8,  0)

    // ─── フォーマット ─────────────────────────────────────────────────────────
    private val FMT_MD    = DateTimeFormatter.ofPattern("M/d")
    private val FMT_MDHM  = DateTimeFormatter.ofPattern("M/d HH:mm")

    /** "M/D" (例: "4/6") */
    fun formatMd(dt: ZonedDateTime): String = dt.withZoneSameInstant(JST).format(FMT_MD)

    /** "M/D HH:mm" (例: "4/6 09:50") */
    fun formatMdHm(dt: ZonedDateTime): String = dt.withZoneSameInstant(JST).format(FMT_MDHM)

    /** ISO 文字列 → ZonedDateTime (JST) */
    fun parseJst(iso: String): ZonedDateTime =
        ZonedDateTime.parse(iso).withZoneSameInstant(JST)

    // ─── セッション判定 ───────────────────────────────────────────────────────
    /**
     * @param now         判定基準時刻
     * @param isHoliday   祝日判定関数 (ymd: String) -> Boolean。省略時は JapanHolidayProvider
     */
    fun getSession(
        now: ZonedDateTime,
        isHoliday: (String) -> Boolean = JapanHolidayProvider,
    ): MarketSession {
        val jst = now.withZoneSameInstant(JST)
        val ymd = jst.toLocalDate().toString()
        if (isHoliday(ymd)) return MarketSession.HOLIDAY

        val t = jst.toLocalTime()
        return when {
            t < PRE_OPEN_START  -> MarketSession.AFTER_CLOSE   // 前日終了後〜翌日 pre_open 前
            t < MORNING_START   -> MarketSession.PRE_OPEN
            t < MORNING_END     -> MarketSession.MORNING
            t < AFTERNOON_START -> MarketSession.LUNCH_BREAK
            t < AFTERNOON_END   -> MarketSession.AFTERNOON
            else                -> MarketSession.AFTER_CLOSE
        }
    }

    // ─── 営業日差計算 ─────────────────────────────────────────────────────────
    /**
     * fromYmd から toYmd までの営業日数差を返す。
     * Web 側 businessDayDiff と同一ロジック:
     *   - from (exclusive) → to (inclusive) の範囲で営業日をカウント
     *   - to が休日なら to はカウントしない
     */
    fun businessDayDiff(
        fromYmd: String,
        toYmd: String,
        isHoliday: (String) -> Boolean = JapanHolidayProvider,
    ): Int {
        if (fromYmd == toYmd) return 0
        val from = LocalDate.parse(fromYmd)
        val to   = LocalDate.parse(toYmd)
        val forward = to > from
        var count = 0
        var cursor = from

        repeat(500) {
            cursor = if (forward) cursor.plusDays(1) else cursor.minusDays(1)
            val ymd = cursor.toString()
            val isBizDay = !isHoliday(ymd)
            if (ymd == toYmd) {
                if (isBizDay) count += if (forward) 1 else -1
                return count
            }
            if (isBizDay) count += if (forward) 1 else -1
        }
        return count
    }

    /** ymd の直前の営業日を返す (ymd 自身は含まない) */
    fun prevBusinessDay(ymd: String, isHoliday: (String) -> Boolean = JapanHolidayProvider): String {
        var cursor = LocalDate.parse(ymd)
        repeat(30) {
            cursor = cursor.minusDays(1)
            if (!isHoliday(cursor.toString())) return cursor.toString()
        }
        error("prevBusinessDay: no business day found before $ymd")
    }
}
