/**
 * baselineDate.ts
 *
 * 価格の「基準日 (YYYY-MM-DD)」を導出する。
 *
 * 基準日とは「この価格が表す営業日」のこと。
 * - 株式 intraday/close : 当日の JST 日付
 * - 投信 nav            : marketDataAt の日付 (あれば)、なければ前営業日を返す
 * - reference           : explicitBaselineDate を使用。なければ前営業日
 */

import type { AssetClass, QuoteKind } from '../types/market';
import {
  formatYmdTokyo,
  prevBusinessDay,
  isBusinessDay,
  type IsHolidayProvider,
} from './marketClock';

export interface DeriveBaselineDateInput {
  assetClass: AssetClass;
  quoteKind: QuoteKind;
  /** 価格が成立した市場時刻 (ISO string, 取得できた場合のみ) */
  marketDataAt?: string | null;
  /** 判定基準の「現在時刻」 */
  now: Date;
  /** 呼び出し元が明示的に指定した場合に優先する */
  explicitBaselineDate?: string;
  isHolidayProvider?: IsHolidayProvider;
}

/**
 * 基準日を導出して YYYY-MM-DD 形式で返す。
 */
export function deriveBaselineDate(input: DeriveBaselineDateInput): string {
  const {
    assetClass,
    quoteKind,
    marketDataAt,
    now,
    explicitBaselineDate,
    isHolidayProvider,
  } = input;

  // 明示指定が最優先
  if (explicitBaselineDate) return explicitBaselineDate;

  const todayYmd = formatYmdTokyo(now);

  // ── 株式系 (jp_stock / jp_etf / jp_reit) ──
  if (assetClass !== 'mutual_fund') {
    if (quoteKind === 'intraday' || quoteKind === 'close') {
      // marketDataAt があればその日付を使う
      if (marketDataAt) {
        const d = new Date(marketDataAt);
        if (!Number.isNaN(d.getTime())) return formatYmdTokyo(d);
      }
      // なければ当日 JST 日付
      return todayYmd;
    }
    // reference: 前営業日
    return prevBusinessDay(todayYmd, isHolidayProvider);
  }

  // ── 投資信託 (mutual_fund) ──
  if (quoteKind === 'nav') {
    // marketDataAt があればその日付を使う
    if (marketDataAt) {
      const d = new Date(marketDataAt);
      if (!Number.isNaN(d.getTime())) return formatYmdTokyo(d);
    }
    // 基準価額は前営業日公表が多いため、今日が営業日でも前営業日を返す
    return prevBusinessDay(todayYmd, isHolidayProvider);
  }

  if (quoteKind === 'reference') {
    // 参考価格: 明示指定なければ前営業日
    return prevBusinessDay(todayYmd, isHolidayProvider);
  }

  // mutual_fund に intraday/close は通常使わないが fallback
  if (marketDataAt) {
    const d = new Date(marketDataAt);
    if (!Number.isNaN(d.getTime())) return formatYmdTokyo(d);
  }
  return isBusinessDay(todayYmd, isHolidayProvider)
    ? todayYmd
    : prevBusinessDay(todayYmd, isHolidayProvider);
}
