import type { IMarketFetcher } from './types.js';
import type { MarketSnapshot } from '../types/snapshot.js';
import { fetchAllFundNavs } from './fundNav.js';

/**
 * MockFetcher — 固定値を返すモック実装 (Sprint 5-1)
 *
 * 本物の fetcher に差し替えても PWA 側は変更不要。
 * 開発時は FETCHER=mock 環境変数でこちらを使う。
 */
export class MockFetcher implements IMarketFetcher {
  readonly name = 'mock';

  async fetch(): Promise<MarketSnapshot> {
    // 投信基準価額は Yahoo Finance Japan からスクレイピング
    const fundNavs = await fetchAllFundNavs();

    return {
      fetchedAt: new Date().toISOString(),
      stocks: {
        // 東証上場株 — mock 固定値
        gmopg: {
          price: 8171,
          changePct: 1.2,
          source: 'mock',
          priceKind: 'close',
          baselineDate: new Date().toISOString().slice(0, 10),
        },
        unext: {
          price: 1649,
          changePct: -0.5,
          source: 'mock',
          priceKind: 'close',
          baselineDate: new Date().toISOString().slice(0, 10),
        },
        // 投資信託 — Yahoo Finance Japan から取得
        ab:      fundNavs['ab']      ?? null,
        invesco: fundNavs['invesco'] ?? null,
        wcm:     fundNavs['wcm']     ?? null,
      },
      context: {
        usdJpy: {
          price: 149.8,
          changePct: 0.3,
        },
        usProxy: {
          symbol: 'SPY',
          changePct: 0.8,
        },
        worldProxy: {
          symbol: 'VT',
          changePct: 0.5,
        },
      },
      _meta: {
        fetcher: this.name,
        cacheHit: false,
      },
    };
  }
}
