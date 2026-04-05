import type { IMarketFetcher } from './types.js';
import type { MarketSnapshot } from '../types/snapshot.js';

/**
 * MockFetcher — 固定値を返すモック実装 (Sprint 5-1)
 *
 * 本物の fetcher に差し替えても PWA 側は変更不要。
 * 開発時は FETCHER=mock 環境変数でこちらを使う。
 */
export class MockFetcher implements IMarketFetcher {
  readonly name = 'mock';

  async fetch(): Promise<MarketSnapshot> {
    // 実際の API 接続前の固定値モック
    // Sprint 5-2 で JQuantsFetcher に差し替え
    return {
      fetchedAt: new Date().toISOString(),
      stocks: {
        gmopg: {
          price: 8171,
          changePct: 1.2,
          source: 'mock',
        },
        unext: {
          price: 1649,
          changePct: -0.5,
          source: 'mock',
        },
        ab: {
          price: 9934,
          changePct: 0.8,
          source: 'mock',
        },
        invesco: {
          price: 8382,
          changePct: 1.2,
          source: 'mock',
        },
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
