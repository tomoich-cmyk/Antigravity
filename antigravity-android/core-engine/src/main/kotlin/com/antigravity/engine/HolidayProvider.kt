package com.antigravity.engine

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.Month

/**
 * 日本の祝日・休場日判定 — Web 側 japanHolidayProvider の Kotlin 移植。
 *
 * カバー範囲: 2020-2030
 * 対応ルール:
 *   - 土日
 *   - 国民の祝日 (固定 + ハッピーマンデー + 春分・秋分)
 *   - 振替休日
 *   - 年末年始東証休業 (12/31, 1/2, 1/3)
 */
object JapanHolidayProvider : (String) -> Boolean {

    override fun invoke(ymd: String): Boolean = isHoliday(LocalDate.parse(ymd))

    fun isHoliday(date: LocalDate): Boolean =
        isWeekend(date) ||
        isNationalHoliday(date) ||
        isSubstituteHoliday(date) ||
        isTokyoStockExchangeClosed(date)

    // ─── 土日 ─────────────────────────────────────────────────────────────────
    private fun isWeekend(date: LocalDate): Boolean =
        date.dayOfWeek == DayOfWeek.SATURDAY || date.dayOfWeek == DayOfWeek.SUNDAY

    // ─── 東証独自の休業日 ─────────────────────────────────────────────────────
    private fun isTokyoStockExchangeClosed(date: LocalDate): Boolean =
        (date.month == Month.DECEMBER && date.dayOfMonth == 31) ||
        (date.month == Month.JANUARY  && date.dayOfMonth == 2)  ||
        (date.month == Month.JANUARY  && date.dayOfMonth == 3)

    // ─── 国民の祝日 ───────────────────────────────────────────────────────────
    private fun isNationalHoliday(date: LocalDate): Boolean {
        val y = date.year
        val m = date.month
        val d = date.dayOfMonth
        return when {
            // 元日
            m == Month.JANUARY   && d == 1  -> true
            // 成人の日 (1月第2月曜)
            m == Month.JANUARY   && isNthMonday(date, 2) -> true
            // 建国記念の日
            m == Month.FEBRUARY  && d == 11 -> true
            // 天皇誕生日
            m == Month.FEBRUARY  && d == 23 -> true
            // 春分の日
            m == Month.MARCH     && d == springEquinoxDay(y) -> true
            // 昭和の日
            m == Month.APRIL     && d == 29 -> true
            // 憲法記念日
            m == Month.MAY       && d == 3  -> true
            // みどりの日
            m == Month.MAY       && d == 4  -> true
            // こどもの日
            m == Month.MAY       && d == 5  -> true
            // 海の日 (7月第3月曜)
            m == Month.JULY      && isNthMonday(date, 3) -> true
            // 山の日
            m == Month.AUGUST    && d == 11 -> true
            // 敬老の日 (9月第3月曜)
            m == Month.SEPTEMBER && isNthMonday(date, 3) -> true
            // 秋分の日
            m == Month.SEPTEMBER && d == autumnEquinoxDay(y) -> true
            // スポーツの日 (10月第2月曜)
            m == Month.OCTOBER   && isNthMonday(date, 2) -> true
            // 文化の日
            m == Month.NOVEMBER  && d == 3  -> true
            // 勤労感謝の日
            m == Month.NOVEMBER  && d == 23 -> true
            else -> false
        }
    }

    // ─── 振替休日 ─────────────────────────────────────────────────────────────
    /**
     * 国民の祝日が日曜日の場合、翌月曜日 (他の祝日でなければ) が振替休日。
     * 連続祝日の場合は「最初の平日」まで繰り越す。
     */
    private fun isSubstituteHoliday(date: LocalDate): Boolean {
        if (date.dayOfWeek == DayOfWeek.SUNDAY) return false
        if (isNationalHoliday(date)) return false
        // date の直前の日曜日まで遡り、連続して祝日が続いていれば振替
        var cursor = date.minusDays(1)
        while (cursor.dayOfWeek != DayOfWeek.SUNDAY) {
            if (!isNationalHoliday(cursor)) return false
            cursor = cursor.minusDays(1)
        }
        return isNationalHoliday(cursor)
    }

    // ─── N番目の月曜日 ────────────────────────────────────────────────────────
    private fun isNthMonday(date: LocalDate, n: Int): Boolean {
        if (date.dayOfWeek != DayOfWeek.MONDAY) return false
        return (date.dayOfMonth - 1) / 7 + 1 == n
    }

    // ─── 春分・秋分 (2020-2030) ───────────────────────────────────────────────
    private fun springEquinoxDay(year: Int): Int = when (year) {
        2020 -> 20; 2021 -> 20; 2022 -> 21; 2023 -> 21; 2024 -> 20
        2025 -> 20; 2026 -> 20; 2027 -> 21; 2028 -> 20; 2029 -> 20; 2030 -> 20
        else -> 20
    }

    private fun autumnEquinoxDay(year: Int): Int = when (year) {
        2020 -> 22; 2021 -> 23; 2022 -> 23; 2023 -> 23; 2024 -> 22
        2025 -> 23; 2026 -> 23; 2027 -> 23; 2028 -> 22; 2029 -> 23; 2030 -> 23
        else -> 23
    }
}
