import type { MarketSnapshot } from '../types/snapshot.js';

/**
 * IMarketFetcher — 取得元を差し替えるための抽象インターフェース
 *
 * 実装クラス:
 *   - MockFetcher     (Sprint 5-1)
 *   - JQuantsFetcher  (Sprint 5-2)
 *   - AlphaVantageFetcher (Sprint 5-3 option)
 *   - YahooFetcher    (Sprint 5-3 option)
 */
export interface IMarketFetcher {
  /** fetcher の識別名 */
  readonly name: string;

  /**
   * スナップショットを取得する
   * @throws 取得失敗時はエラーをスローして上位でハンドリング
   */
  fetch(): Promise<MarketSnapshot>;
}
