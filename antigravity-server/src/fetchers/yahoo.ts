/**
 * Yahoo Finance 非公式ヘルパー — サーバーサイド専用
 *
 * Yahoo Finance の /v8/finance/chart/ エンドポイントを使用する。
 * このエンドポイントは公式 API ではないが、安定して長期間使われており、
 * サーバーサイド（CORS 不要）であれば問題なく利用できる。
 *
 * 取得対象:
 *   - USDJPY=X  → USD/JPY レート + 前日比
 *   - SPY       → 米国株 proxy 前日比
 *   - VT        → 世界株 proxy 前日比
 *
 * エラーポリシー:
 *   - 個別シンボルの取得失敗は null を返す（上位で errorsに記録）
 *   - ネットワークタイムアウトは 10 秒
 */

import type { ForexQuote, IndexQuote } from '../types/snapshot.js';
import type { StockQuote } from '../types/snapshot.js';

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Yahoo Finance response types (最低限だけ定義)
// ---------------------------------------------------------------------------

interface YahooMeta {
  regularMarketPrice: number;
  previousClose: number;
  currency: string;
  symbol: string;
}

interface YahooChartResult {
  meta: YahooMeta;
}

interface YahooChartResponse {
  chart: {
    result: YahooChartResult[] | null;
    error: { code: string; description: string } | null;
  };
}

// ---------------------------------------------------------------------------
// Core fetch
// ---------------------------------------------------------------------------

async function fetchYahooMeta(symbol: string): Promise<YahooMeta> {
  const url = `${YAHOO_BASE}/${encodeURIComponent(symbol)}?interval=1d&range=2d`;

  const res = await fetch(url, {
    headers: {
      // ブラウザっぽい UA を付けないとブロックされることがある
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Yahoo Finance HTTP ${res.status} for symbol=${symbol}`);
  }

  const data = (await res.json()) as YahooChartResponse;

  if (data.chart.error) {
    throw new Error(
      `Yahoo Finance API error for ${symbol}: ${data.chart.error.description}`
    );
  }

  const result = data.chart.result?.[0];
  if (!result) {
    throw new Error(`Yahoo Finance: no result for symbol=${symbol}`);
  }

  return result.meta;
}

/** changePct を計算 (小数点2桁まで丸め) */
function calcChangePct(current: number, previous: number): number | undefined {
  if (!previous || previous === 0) return undefined;
  return Math.round(((current - previous) / previous) * 10_000) / 100;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * USD/JPY レートを取得する。
 * 失敗時は null を返す。
 */
export async function fetchUsdJpy(): Promise<ForexQuote | null> {
  try {
    const meta = await fetchYahooMeta('USDJPY=X');
    const price = meta.regularMarketPrice;
    const changePct = calcChangePct(price, meta.previousClose);
    console.log(`[yahoo] USDJPY=X: price=${price} changePct=${changePct ?? 'n/a'}`);
    return { price, changePct };
  } catch (err) {
    console.warn(`[yahoo] USDJPY=X fetch failed: ${(err as Error).message}`);
    return null;
  }
}

/**
 * 米国株 proxy（SPY）の前日比を取得する。
 * 失敗時は null を返す。
 */
export async function fetchUsProxy(): Promise<IndexQuote | null> {
  try {
    const meta = await fetchYahooMeta('SPY');
    const changePct = calcChangePct(meta.regularMarketPrice, meta.previousClose);
    console.log(`[yahoo] SPY: price=${meta.regularMarketPrice} changePct=${changePct ?? 'n/a'}`);
    return { symbol: 'SPY', changePct };
  } catch (err) {
    console.warn(`[yahoo] SPY fetch failed: ${(err as Error).message}`);
    return null;
  }
}

/**
 * 世界株 proxy（VT）の前日比を取得する。
 * 失敗時は null を返す。
 */
export async function fetchWorldProxy(): Promise<IndexQuote | null> {
  try {
    const meta = await fetchYahooMeta('VT');
    const changePct = calcChangePct(meta.regularMarketPrice, meta.previousClose);
    console.log(`[yahoo] VT: price=${meta.regularMarketPrice} changePct=${changePct ?? 'n/a'}`);
    return { symbol: 'VT', changePct };
  } catch (err) {
    console.warn(`[yahoo] VT fetch failed: ${(err as Error).message}`);
    return null;
  }
}

/**
 * 個別株のクオートを取得する。
 * シンボルに .T を付けることで日本株も取得可能。
 */
export async function fetchStockQuote(symbol: string): Promise<StockQuote | null> {
  try {
    const meta = await fetchYahooMeta(symbol);
    const price = meta.regularMarketPrice;
    const changePct = calcChangePct(price, meta.previousClose);
    
    const now = new Date().toISOString();
    let marketDataAt = now;
    
    // 日本株 (.T) の場合はその日の 15:00 JST 終値を想定
    if (symbol.endsWith('.T')) {
      const datePart = now.slice(0, 10);
      marketDataAt = new Date(`${datePart}T15:00:00+09:00`).toISOString();
    }
    // 米国株 (SPY/VT/etc) の場合はその日の 16:00 ET (21:00 UTC) を想定
    else if (symbol === 'SPY' || symbol === 'VT') {
      const datePart = now.slice(0, 10);
      marketDataAt = new Date(`${datePart}T21:00:00Z`).toISOString();
    }

    console.log(`[yahoo] ${symbol}: price=${price} changePct=${changePct ?? 'n/a'}`);
    return { 
      price, 
      changePct, 
      source: 'yahoo',
      marketDataAt,
      syncedAt: now,
      priceKind: 'market'
    };
  } catch (err) {
    console.warn(`[yahoo] ${symbol} fetch failed: ${(err as Error).message}`);
    return null;
  }
}

/**
 * USD/JPY + SPY + VT をすべて並行取得する。
 * すべて失敗しても null が入るだけでクラッシュしない。
 */
export async function fetchAllContext(): Promise<{
  usdJpy: ForexQuote | null;
  usProxy: IndexQuote | null;
  worldProxy: IndexQuote | null;
  errors: Record<string, string>;
}> {
  const [usdJpy, usProxy, worldProxy] = await Promise.all([
    fetchUsdJpy(),
    fetchUsProxy(),
    fetchWorldProxy(),
  ]);

  const errors: Record<string, string> = {};
  if (!usdJpy)     errors['context.usdJpy']     = 'Yahoo Finance fetch failed';
  if (!usProxy)    errors['context.usProxy']    = 'Yahoo Finance fetch failed';
  if (!worldProxy) errors['context.worldProxy'] = 'Yahoo Finance fetch failed';

  return { usdJpy, usProxy, worldProxy, errors };
}
