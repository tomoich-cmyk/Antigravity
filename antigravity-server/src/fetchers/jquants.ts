/**
 * JQuantsFetcher — J-Quants API を使った実装 (Sprint 5-2)
 *
 * 設計上のポイント:
 * - GMOPG と U-NEXT を Promise.allSettled で並行取得 → 片方失敗でもクラッシュしない
 * - 日付フォールバック: 当日データがない場合（休場・T+1遅延）は前営業日に遡る
 * - 401 受信時はトークンを無効化して次回リクエストで再認証を促す
 * - _meta.errors にフィールドごとのエラーを詰めてレスポンスに含める
 *
 * 環境変数:
 *   JQUANTS_EMAIL    — J-Quants 登録メールアドレス
 *   JQUANTS_PASSWORD — J-Quants パスワード
 *
 * 注意 (Free Plan):
 *   無料プランは T+1 遅延のため、本日の確定値は翌営業日に取得可能です。
 *   日中は前日の終値が返ります。
 */

import type { IMarketFetcher } from './types.js';
import type { MarketSnapshot, StockQuote } from '../types/snapshot.js';
import { getIdToken, invalidateTokens } from '../lib/tokenStore.js';
import { fetchAllContext, fetchStockQuote } from './yahoo.js';

const JQUANTS_BASE = 'https://api.jquants.com/v1';

// Stock codes (4-digit TSE codes)
const STOCK_CODES = {
  gmopg: '3769',
  unext: '9418',
} as const;

// ---------------------------------------------------------------------------
// J-Quants response types
// ---------------------------------------------------------------------------

interface DailyQuote {
  Date: string;    // e.g. "2026-03-31"
  Code: string;    // e.g. "37690" (5-digit)
  Open: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
  TurnoverValue: number;
  AdjustmentClose: number;
}

interface DailyQuotesResponse {
  daily_quotes: DailyQuote[];
  pagination_key?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns YYYYMMDD strings for the most recent business days (Mon-Fri),
 * starting from today and going backwards.
 */
function recentBusinessDates(count: number): string[] {
  const result: string[] = [];
  const d = new Date();
  while (result.length < count) {
    const dow = d.getDay(); // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) {
      // Format: YYYYMMDD
      result.push(d.toISOString().slice(0, 10).replace(/-/g, ''));
    }
    d.setDate(d.getDate() - 1);
  }
  return result;
}

/**
 * Fetch the daily quote for a specific date.
 * Returns null if no data is available (holiday / date not yet published).
 * Throws on auth failure (401) or network error.
 */
async function fetchQuoteForDate(
  code: string,
  date: string, // YYYYMMDD
  idToken: string
): Promise<DailyQuote | null> {
  const url = `${JQUANTS_BASE}/prices/daily_quotes?code=${code}&date=${date}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
    signal: AbortSignal.timeout(12_000),
  });

  if (res.status === 401) {
    invalidateTokens();
    throw new Error(`J-Quants 401 Unauthorized for code=${code} date=${date} — tokens invalidated`);
  }

  if (!res.ok) {
    throw new Error(`J-Quants API error: HTTP ${res.status} for code=${code} date=${date}`);
  }

  const data = await res.json() as DailyQuotesResponse;
  const quotes = data.daily_quotes ?? [];
  return quotes.length > 0 ? quotes[0] : null;
}

/**
 * Walk recent business days until data is found.
 * Returns the most recent (current) quote and the one before it (for changePct).
 */
async function fetchWithFallback(
  code: string,
  idToken: string,
  maxDays = 6
): Promise<{ current: DailyQuote; previous: DailyQuote | null } | null> {
  const dates = recentBusinessDates(maxDays);

  for (let i = 0; i < dates.length - 1; i++) {
    const quote = await fetchQuoteForDate(code, dates[i], idToken);
    if (!quote) {
      // No data for this date (holiday / T+1 not yet published) → try older date
      console.log(`[jquants] no data for code=${code} date=${dates[i]}, trying ${dates[i + 1]}`);
      continue;
    }

    // Found a quote — try to get the previous day for changePct
    let previous: DailyQuote | null = null;
    try {
      previous = await fetchQuoteForDate(code, dates[i + 1], idToken);
    } catch {
      // Previous day unavailable → changePct will be undefined, that's acceptable
    }

    console.log(
      `[jquants] upstream OK: code=${code} date=${quote.Date} close=${quote.Close}` +
      (previous ? ` prev=${previous.Close}` : ' (no prev)')
    );
    return { current: quote, previous };
  }

  return null; // No data found in any of the recent dates
}

/** Compute StockQuote from raw J-Quants data (treated as Historical) */
function toStockQuote(current: DailyQuote, previous: DailyQuote | null): StockQuote {
  let changePct: number | undefined;
  if (previous && previous.Close > 0) {
    changePct =
      Math.round(((current.Close - previous.Close) / previous.Close) * 10_000) / 100;
  }
  
  // J-Quants の日付（YYYY-MM-DD）の終値であることを明示
  // 便宜上、時刻は 15:00:00 (JST) とする
  const marketDataAt = new Date(`${current.Date}T15:00:00+09:00`).toISOString();

  return {
    price: current.Close,
    changePct,
    source: `jquants:${current.Date}`,
    marketDataAt,
    syncedAt: new Date().toISOString(),
    priceKind: 'close', // J-Quants は「大引け値（終値）」
    baselineDate: current.Date, // "YYYY-MM-DD"
  };
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

export class JQuantsFetcher implements IMarketFetcher {
  readonly name = 'jquants';

  async fetch(): Promise<MarketSnapshot> {
    // Acquire a valid idToken (refreshes / re-auths as needed)
    const idToken = await getIdToken();

    // Fetch J-Quants stocks + Yahoo stocks + Yahoo Finance context in parallel
    const [
      gmopgResult,
      unextResult,
      gmopgYahooResult,
      unextYahooResult,
      contextResult,
    ] = await Promise.allSettled([
      fetchWithFallback(STOCK_CODES.gmopg, idToken),
      fetchWithFallback(STOCK_CODES.unext, idToken),
      fetchStockQuote(`${STOCK_CODES.gmopg}.T`),
      fetchStockQuote(`${STOCK_CODES.unext}.T`),
      fetchAllContext(),
    ]);

    const errors: Record<string, string> = {};

    // --- Helper for Hybrid Logic ---
    const mergeQuote = (jq: StockQuote | undefined, yh: StockQuote | null | undefined): StockQuote | undefined => {
      if (!jq && !yh) return undefined;
      if (!yh) return jq;
      if (!jq) return yh;

      // Yahoo (Freshness Overlay) と J-Quants (Historical Official) の比較
      // Yahoo のデータが J-Quants の大引け時刻より新しい、または同価格でより最近同期されている場合に Yahoo を優先
      const jqTime = new Date(jq.marketDataAt || 0).getTime();
      const yhTime = new Date(yh.marketDataAt || 0).getTime();

      if (yhTime > jqTime) {
        console.log(`[jquants] overlaying Yahoo (fresh) over J-Quants (old) for a stock`);
        return {
          ...yh,
          // J-Quants の方を正式な前日比として使いたい場合もあるが、Yahoo の方が最新値に基づいているので Yahoo を優先
        };
      }

      return jq;
    };

    // --- GMOPG ---
    let gmopgJq: StockQuote | undefined;
    if (gmopgResult.status === 'fulfilled' && gmopgResult.value) {
      gmopgJq = toStockQuote(gmopgResult.value.current, gmopgResult.value.previous);
    }
    const gmopgYahoo = gmopgYahooResult.status === 'fulfilled' ? gmopgYahooResult.value : null;
    const gmopg = mergeQuote(gmopgJq, gmopgYahoo);
    if (!gmopg && gmopgResult.status === 'rejected') {
        errors['stocks.gmopg'] = (gmopgResult.reason as Error).message;
    }

    // --- U-NEXT ---
    let unextJq: StockQuote | undefined;
    if (unextResult.status === 'fulfilled' && unextResult.value) {
      unextJq = toStockQuote(unextResult.value.current, unextResult.value.previous);
    }
    const unextYahoo = unextYahooResult.status === 'fulfilled' ? unextYahooResult.value : null;
    const unext = mergeQuote(unextJq, unextYahoo);
    if (!unext && unextResult.status === 'rejected') {
        errors['stocks.unext'] = (unextResult.reason as Error).message;
    }

    // --- Context (USD/JPY + SPY + VT) ---
    let usdJpy: MarketSnapshot['context']['usdJpy'];
    let usProxy: MarketSnapshot['context']['usProxy'];
    let worldProxy: MarketSnapshot['context']['worldProxy'];

    if (contextResult.status === 'fulfilled') {
      const ctx = contextResult.value;
      usdJpy     = ctx.usdJpy     ?? undefined;
      usProxy    = ctx.usProxy    ?? undefined;
      worldProxy = ctx.worldProxy ?? undefined;
      // Merge context errors into the main errors map
      Object.assign(errors, ctx.errors);
    } else {
      const msg = (contextResult.reason as Error).message;
      errors['context'] = msg;
      console.warn(`[jquants] context fetch failed: ${msg}`);
    }

    const hasErrors = Object.keys(errors).length > 0;
    const hasAnyData = gmopg !== undefined || unext !== undefined;

    if (hasErrors) {
      console.warn(`[jquants] partial response — errors: [${Object.keys(errors).join(', ')}]`);
    }

    // --- 投資信託 (AB / インベスコ) — 市場 API 対象外のため mock 値を使用 ---
    // 実際の基準価額は運用会社サイト or 手動更新が必要
    const today = new Date().toISOString().slice(0, 10);
    const ab: StockQuote = {
      price:       9780,
      source:      'mock:fund',
      priceKind:   'official',
      baselineDate: today,
      syncedAt:    new Date().toISOString(),
    };
    const invesco: StockQuote = {
      price:       8194,
      source:      'mock:fund',
      priceKind:   'official',
      baselineDate: today,
      syncedAt:    new Date().toISOString(),
    };

    return {
      fetchedAt: new Date().toISOString(),
      stocks: { gmopg, unext, ab, invesco },
      context: { usdJpy, usProxy, worldProxy },
      _meta: {
        fetcher: this.name,
        cacheHit: false,
        ...(hasErrors && {
          partial: hasAnyData,
          errors,
        }),
      },
    };
  }
}
