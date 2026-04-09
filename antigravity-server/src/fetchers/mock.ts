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
        // 東証上場株 — 4/10 終値ベースの参考値 (priceKind: 'close')
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
        // 投資信託 — 基準価額 (priceKind: 'official')
        ab: {
          price: 9780,
          changePct: 0.8,
          source: 'mock',
          priceKind: 'official',
          baselineDate: new Date().toISOString().slice(0, 10),
        },
        invesco: {
          price: 8194,
          changePct: 1.2,
          source: 'mock',
          priceKind: 'official',
          baselineDate: new Date().toISOString().slice(0, 10),
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
