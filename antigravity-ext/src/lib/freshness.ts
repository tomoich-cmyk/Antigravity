/**
 * freshness.ts
 *
 * QuoteSnapshot の鮮度を評価し FreshnessView を返す。
 *
 * quoteKind 別の評価ロジック:
 *   intraday  → evaluateIntraday
 *   close     → evaluateClose
 *   nav       → evaluateNav
 *   reference → evaluateReference
 */

import type { FreshnessView, FreshnessLevel, FreshnessReason, QuoteSnapshot } from '../types/market';
import {
  getMarketSessionTokyo,
  formatYmdTokyo,
  formatMdHmTokyo,
  formatMdTokyo,
  businessDayDiff,
  type IsHolidayProvider,
} from './marketClock';

// ─── 内部ヘルパー ─────────────────────────────────────────────────────────────

function minutesAgo(isoStr: string, now: Date): number {
  const t = new Date(isoStr).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (now.getTime() - t) / 60_000;
}

function makeView(
  isStale: boolean,
  level: FreshnessLevel,
  asOfLabel: string,
  canPretendCurrent: boolean,
  reason?: FreshnessReason,
  message?: string,
): FreshnessView {
  return { isStale, level, asOfLabel, canPretendCurrent, reason, message };
}

// ─── intraday 評価 ────────────────────────────────────────────────────────────
/**
 * 場中リアルタイム/遅延気配の鮮度評価。
 *
 * - marketDataAt が 20 分以内かつ場中 → fresh, canPretendCurrent = true
 * - marketDataAt が 20〜60 分以内かつ場中 → lagging
 * - 場外 (after_close / holiday) で当日データ → fresh (終値として扱う)
 * - 前営業日以前のデータ → stale
 */
function evaluateIntraday(
  quote: QuoteSnapshot,
  now: Date,
  hp?: IsHolidayProvider,
): FreshnessView {
  const session = getMarketSessionTokyo(now, hp);
  const todayYmd = formatYmdTokyo(now);

  // marketDataAt がない場合は syncedAt で代替
  const dataTimeStr = quote.marketDataAt ?? quote.syncedAt;
  const dataTime = new Date(dataTimeStr);
  const dataYmd = !Number.isNaN(dataTime.getTime()) ? formatYmdTokyo(dataTime) : null;
  const mins = minutesAgo(dataTimeStr, now);

  // 前営業日以前なら stale
  if (dataYmd && dataYmd < todayYmd) {
    const label = `${formatMdTokyo(dataTime)} 前営業日`;
    return makeView(true, 'stale', label, false, 'provider_delay',
      '前日以前のデータです。手動更新してください。');
  }

  // 場外 (閉場後 / 休場)
  if (session === 'after_close' || session === 'holiday') {
    // 当日データなら "終値" として扱い fresh
    if (dataYmd === todayYmd) {
      const label = quote.marketDataAt
        ? `${formatMdHmTokyo(dataTime)} 終値`
        : `${formatMdTokyo(now)} 終値`;
      return makeView(false, 'fresh', label, false, 'market_closed',
        '市場は閉場中です。');
    }
    // データが無い or 別日
    return makeView(true, 'stale',
      dataYmd ? `${formatMdTokyo(dataTime)} 前日終値` : '—',
      false, 'provider_delay', '市場は閉場中です。');
  }

  // 場中 (morning / afternoon)
  if (session === 'morning' || session === 'afternoon') {
    if (!quote.marketDataAt) {
      return makeView(false, 'unknown',
        `${formatMdTokyo(now)} 時刻不明`, false, 'missing_market_time');
    }
    if (mins <= 20) {
      return makeView(false, 'fresh',
        `${formatMdHmTokyo(dataTime)} 時点`, true);
    }
    if (mins <= 60) {
      return makeView(false, 'lagging',
        `${formatMdHmTokyo(dataTime)} 時点 (遅延)`, false, 'provider_delay',
        `${Math.floor(mins)}分前のデータです。`);
    }
    return makeView(true, 'stale',
      `${formatMdHmTokyo(dataTime)} 時点`, false, 'provider_delay',
      `${Math.floor(mins)}分前のデータです。更新してください。`);
  }

  // pre_open / lunch_break: 直前セッション終値として扱う
  if (quote.marketDataAt) {
    const label = `${formatMdHmTokyo(dataTime)} 時点`;
    return makeView(false, 'fresh', label, false, 'market_closed');
  }
  return makeView(false, 'unknown', `${formatMdTokyo(now)} 時刻不明`, false, 'missing_market_time');
}

// ─── close 評価 ───────────────────────────────────────────────────────────────
/**
 * 確定終値の鮮度評価。
 *
 * - baselineDate が当日 → fresh
 * - baselineDate が前営業日 (1 営業日差) → fresh (翌朝確認として問題なし)
 * - 2 営業日以上前 → stale
 */
function evaluateClose(
  quote: QuoteSnapshot,
  now: Date,
  hp?: IsHolidayProvider,
): FreshnessView {
  const todayYmd = formatYmdTokyo(now);
  const baseline = quote.baselineDate;

  if (!baseline) {
    return makeView(true, 'unknown', '—', false, 'missing_market_time');
  }

  const diff = businessDayDiff(baseline, todayYmd, hp); // baseline → today

  if (diff === 0) {
    return makeView(false, 'fresh', `${formatMdTokyo(new Date(`${baseline}T00:00:00+09:00`))} 終値`, false);
  }
  if (diff === 1) {
    // 前営業日終値: 翌朝はこれが最新
    return makeView(false, 'fresh',
      `${formatMdTokyo(new Date(`${baseline}T00:00:00+09:00`))} 終値`, false,
      'market_closed', '前営業日の確定終値です。');
  }
  return makeView(true, 'stale',
    `${formatMdTokyo(new Date(`${baseline}T00:00:00+09:00`))} 終値`,
    false, 'provider_delay', `${diff}営業日前の終値です。`);
}

// ─── nav 評価 ─────────────────────────────────────────────────────────────────
/**
 * 投信基準価額の鮮度評価。
 *
 * 基準価額は「T+1 公表」(当日約定→翌営業日基準価額確定)。
 * - baselineDate が前営業日 → fresh
 * - baselineDate が 2 営業日前 → lagging (祝日連休明け等で許容)
 * - 3 営業日以上前 → stale
 */
function evaluateNav(
  quote: QuoteSnapshot,
  now: Date,
  hp?: IsHolidayProvider,
): FreshnessView {
  const todayYmd = formatYmdTokyo(now);
  const baseline = quote.baselineDate;

  if (!baseline) {
    return makeView(true, 'unknown', '—', false, 'missing_market_time');
  }

  const baseDate = new Date(`${baseline}T00:00:00+09:00`);
  const label = `${formatMdTokyo(baseDate)} 基準価額`;
  const diff = businessDayDiff(baseline, todayYmd, hp); // baseline → today

  if (diff <= 1) {
    // 前営業日または当日 (当日は稀だが許容)
    return makeView(false, 'fresh', label, false);
  }
  if (diff === 2) {
    // 2 営業日差: 祝日挟みの連休明け等
    return makeView(false, 'lagging', label, false, 'holiday_gap',
      '祝日をまたいでいる可能性があります。');
  }
  return makeView(true, 'stale', label, false, 'nav_not_updated',
    `${diff}営業日前の基準価額です。更新してください。`);
}

// ─── reference 評価 ───────────────────────────────────────────────────────────
/**
 * 参考価格 (前日基準価額等) の鮮度評価。
 *
 * reference は「未確定の推定値」なので常に lagging 扱い。
 * - baselineDate が前営業日 → lagging
 * - 2 営業日以上前 → stale
 */
function evaluateReference(
  quote: QuoteSnapshot,
  now: Date,
  hp?: IsHolidayProvider,
): FreshnessView {
  const todayYmd = formatYmdTokyo(now);
  const baseline = quote.baselineDate;

  if (!baseline) {
    return makeView(true, 'unknown', '—', false, 'missing_market_time');
  }

  const baseDate = new Date(`${baseline}T00:00:00+09:00`);
  const label = `${formatMdTokyo(baseDate)} 参考`;
  const diff = businessDayDiff(baseline, todayYmd, hp);

  if (diff <= 1) {
    return makeView(false, 'lagging', label, false, 'market_closed',
      '参考価格です（未確定）。');
  }
  return makeView(true, 'stale', label, false, 'nav_not_updated',
    `${diff}営業日前の参考価格です。`);
}

// ─── public API ───────────────────────────────────────────────────────────────

export interface EvaluateFreshnessInput {
  quote: QuoteSnapshot;
  /** 判定基準の「現在時刻」。省略時は Date.now() */
  now?: Date;
  isHolidayProvider?: IsHolidayProvider;
}

/**
 * QuoteSnapshot の鮮度を評価し FreshnessView を返す。
 */
export function evaluateFreshness(input: EvaluateFreshnessInput): FreshnessView {
  const { quote, isHolidayProvider: hp } = input;
  const now = input.now ?? new Date();

  switch (quote.quoteKind) {
    case 'intraday':
      return evaluateIntraday(quote, now, hp);
    case 'close':
      return evaluateClose(quote, now, hp);
    case 'nav':
      return evaluateNav(quote, now, hp);
    case 'reference':
      return evaluateReference(quote, now, hp);
    default: {
      // exhaustive check
      const _: never = quote.quoteKind;
      void _;
      return makeView(true, 'unknown', '—', false, 'unsupported');
    }
  }
}
