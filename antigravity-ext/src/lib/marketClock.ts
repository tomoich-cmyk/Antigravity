/**
 * marketClock.ts
 *
 * 東京市場の時刻・セッション・営業日ヘルパー。
 * 外部ライブラリ不使用。祝日判定は isHolidayProvider 注入で拡張可能。
 *
 * JST = UTC+9 固定 (夏時間なし)
 */

import type { MarketSession } from '../types/market';

// ─── 型 ───────────────────────────────────────────────────────────────────────
export type IsHolidayProvider = (ymd: string) => boolean;

// TSE 終値延長後スケジュール (2024-11-05〜)
// 前場: 9:00〜11:30, 後場: 12:30〜15:30
const MORNING_START  = { h:  9, m:  0 };
const MORNING_END    = { h: 11, m: 30 };
const AFTERNOON_START = { h: 12, m: 30 };
const AFTERNOON_END  = { h: 15, m: 30 };
const PRE_OPEN_START = { h:  8, m:  0 };

// ─── JST 変換ヘルパー ─────────────────────────────────────────────────────────
/**
 * Date を JST に変換し { year, month (1-12), day, hour, minute, weekday (0=Sun) } を返す
 */
export function toJst(d: Date): {
  year: number; month: number; day: number;
  hour: number; minute: number; weekday: number;
} {
  // JST = UTC + 9h
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return {
    year:    jst.getUTCFullYear(),
    month:   jst.getUTCMonth() + 1,
    day:     jst.getUTCDate(),
    hour:    jst.getUTCHours(),
    minute:  jst.getUTCMinutes(),
    weekday: jst.getUTCDay(),
  };
}

/** YYYY-MM-DD (JST) */
export function formatYmdTokyo(d: Date): string {
  const { year, month, day } = toJst(d);
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

/** M/D HH:mm (JST) */
export function formatMdHmTokyo(d: Date): string {
  const { month, day, hour, minute } = toJst(d);
  return `${month}/${day} ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
}

/** M/D (JST) */
export function formatMdTokyo(d: Date): string {
  const { month, day } = toJst(d);
  return `${month}/${day}`;
}

// ─── 土日・祝日判定 ───────────────────────────────────────────────────────────

/** JST で土曜 (6) / 日曜 (0) か */
export function isWeekendTokyo(d: Date): boolean {
  const { weekday } = toJst(d);
  return weekday === 0 || weekday === 6;
}

/**
 * デフォルト祝日チェック (土日のみ)。
 * 実際の祝日カレンダーが必要な場合は IsHolidayProvider を注入する。
 */
export function isHolidayTokyo(ymd: string, provider?: IsHolidayProvider): boolean {
  if (provider) return provider(ymd);
  const d = new Date(`${ymd}T00:00:00+09:00`);
  return isWeekendTokyo(d);
}

/** 営業日か */
export function isBusinessDay(ymd: string, provider?: IsHolidayProvider): boolean {
  return !isHolidayTokyo(ymd, provider);
}

// ─── セッション判定 ───────────────────────────────────────────────────────────
function hmToMinutes(h: number, m: number): number { return h * 60 + m; }

/**
 * 現在の東京市場セッションを返す。
 * @param now   判定基準時刻 (default: Date.now())
 * @param isHolidayProvider 祝日判定関数 (省略時: 土日のみ)
 */
export function getMarketSessionTokyo(
  now: Date = new Date(),
  isHolidayProvider?: IsHolidayProvider,
): MarketSession {
  const ymd = formatYmdTokyo(now);
  if (isHolidayTokyo(ymd, isHolidayProvider)) return 'holiday';

  const { hour, minute } = toJst(now);
  const cur = hmToMinutes(hour, minute);
  const preOpen   = hmToMinutes(PRE_OPEN_START.h,   PRE_OPEN_START.m);
  const mornStart = hmToMinutes(MORNING_START.h,    MORNING_START.m);
  const mornEnd   = hmToMinutes(MORNING_END.h,      MORNING_END.m);
  const aftnStart = hmToMinutes(AFTERNOON_START.h,  AFTERNOON_START.m);
  const aftnEnd   = hmToMinutes(AFTERNOON_END.h,    AFTERNOON_END.m);

  if (cur < preOpen)   return 'after_close'; // 前日終了後〜翌日 pre_open 前
  if (cur < mornStart) return 'pre_open';
  if (cur < mornEnd)   return 'morning';
  if (cur < aftnStart) return 'lunch_break';
  if (cur < aftnEnd)   return 'afternoon';
  return 'after_close';
}

// ─── 営業日差計算 ─────────────────────────────────────────────────────────────
/**
 * fromYmd から toYmd までの営業日数差を返す (forward = 正, backward = 負)。
 * 最大 365 日分を探索する。
 */
export function businessDayDiff(
  fromYmd: string,
  toYmd: string,
  isHolidayProvider?: IsHolidayProvider,
): number {
  if (fromYmd === toYmd) return 0;

  const from = new Date(`${fromYmd}T00:00:00+09:00`);
  const to   = new Date(`${toYmd}T00:00:00+09:00`);
  const forward = to > from;
  let count = 0;
  const cursor = new Date(from.getTime());

  // 最大 500 日
  for (let i = 0; i < 500; i++) {
    cursor.setUTCDate(cursor.getUTCDate() + (forward ? 1 : -1));
    const ymd = formatYmdTokyo(cursor);
    if (ymd === toYmd) {
      // to が休日でも距離はカウント（休日に到達した場合はそのままカウント）
      if (isBusinessDay(ymd, isHolidayProvider)) count += (forward ? 1 : -1);
      break;
    }
    if (isBusinessDay(ymd, isHolidayProvider)) {
      count += (forward ? 1 : -1);
    }
  }
  return count;
}

/**
 * ymd の直前の営業日を返す (ymd 自身は含まない)。
 */
export function prevBusinessDay(
  ymd: string,
  isHolidayProvider?: IsHolidayProvider,
): string {
  const d = new Date(`${ymd}T00:00:00+09:00`);
  for (let i = 0; i < 30; i++) {
    d.setUTCDate(d.getUTCDate() - 1);
    const candidate = formatYmdTokyo(d);
    if (isBusinessDay(candidate, isHolidayProvider)) return candidate;
  }
  throw new Error(`prevBusinessDay: no business day found before ${ymd}`);
}

/**
 * ymd の翌営業日を返す (ymd 自身は含まない)。
 */
export function nextBusinessDay(
  ymd: string,
  isHolidayProvider?: IsHolidayProvider,
): string {
  const d = new Date(`${ymd}T00:00:00+09:00`);
  for (let i = 0; i < 30; i++) {
    d.setUTCDate(d.getUTCDate() + 1);
    const candidate = formatYmdTokyo(d);
    if (isBusinessDay(candidate, isHolidayProvider)) return candidate;
  }
  throw new Error(`nextBusinessDay: no business day found after ${ymd}`);
}
