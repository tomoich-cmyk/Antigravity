/**
 * fundNav.ts
 *
 * Yahoo Finance Japan から投資信託の基準価額をスクレイピングする。
 *
 * 対象:
 *   AB (米国成長株投信D)  : 39312149
 *   インベスコ (世界厳選) : 18312991
 *   WCM (世界成長株厳選) : 6831221A
 *
 * 取得方法:
 *   Yahoo Finance Japan の投信詳細ページには
 *   {"updateDate":"05/08","price":"10,861",...} 形式の JSON が埋め込まれており、
 *   これを正規表現で抽出する。追加ライブラリ不要。
 *
 * 注意:
 *   - 基準価額の公表は前営業日。場中にアクセスしても前日値になる。
 *   - サイト構造変更があれば抽出パターンを見直すこと。
 */

import type { StockQuote } from '../types/snapshot.js';

const FUND_MAP: Record<string, string> = {
  'ab':      '39312149',
  'invesco': '18312991',
  'wcm':     '6831221A',
};

const YAHOO_BASE = 'https://finance.yahoo.co.jp/quote/';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

/**
 * Yahoo Finance Japan から単一ファンドの基準価額を取得する。
 * @returns price と baselineDate、取得失敗時は null
 */
async function fetchOneNav(fundCode: string): Promise<{ price: number; baselineDate: string } | null> {
  try {
    const url = `${YAHOO_BASE}${fundCode}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.warn(`[fundNav] HTTP ${res.status} for ${fundCode}`);
      return null;
    }

    const html = await res.text();

    // 埋め込み JSON から "updateDate":"MM/DD","price":"XX,XXX" を抽出
    const match = html.match(/"updateDate":"(\d{2}\/\d{2})","price":"([\d,]+)"/);
    if (!match) {
      console.warn(`[fundNav] pattern not found for ${fundCode}`);
      return null;
    }

    const price = parseInt(match[2].replace(/,/g, ''), 10);
    if (isNaN(price) || price <= 0) {
      console.warn(`[fundNav] invalid price for ${fundCode}: ${match[2]}`);
      return null;
    }

    // "05/08" → "2026-05-08" (当年を補完)
    const year = new Date().getFullYear();
    const [mm, dd] = match[1].split('/');
    const baselineDate = `${year}-${mm}-${dd}`;

    return { price, baselineDate };
  } catch (err) {
    console.warn(`[fundNav] fetch error for ${fundCode}:`, err);
    return null;
  }
}

/**
 * 全ファンドの基準価額を並列取得して StockQuote の Map で返す。
 * キー: 'ab' | 'invesco' | 'wcm'
 */
export async function fetchAllFundNavs(): Promise<Record<string, StockQuote | null>> {
  const entries = await Promise.all(
    Object.entries(FUND_MAP).map(async ([key, code]) => {
      const nav = await fetchOneNav(code);
      if (!nav) return [key, null] as const;

      const quote: StockQuote = {
        price:        nav.price,
        source:       'yahoo:fund',
        priceKind:    'official',
        baselineDate: nav.baselineDate,
        syncedAt:     new Date().toISOString(),
      };
      return [key, quote] as const;
    })
  );

  return Object.fromEntries(entries);
}
