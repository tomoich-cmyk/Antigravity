/**
 * MarketSnapshot — サーバーから受け取るスナップショット型 (PWA側)
 *
 * サーバー側 `antigravity-server/src/types/snapshot.ts` と同一の定義。
 * `_meta` は optional なので、サーバーが古いバージョンでも動作する。
 */
export type MarketSnapshot = {
  fetchedAt: string;
  stocks: {
    gmopg?: StockQuote;
    unext?: StockQuote;
  };
  context: {
    usdJpy?: ForexQuote;
    usProxy?: IndexQuote;
    worldProxy?: IndexQuote;
  };
  /** 取得メタ情報（オプション） */
  _meta?: SnapshotMeta;
};

export type SnapshotMeta = {
  fetcher: string;
  cacheHit: boolean;
  stale?: boolean;
  partial?: boolean;
  errors?: Record<string, string>;
};

export type StockQuote = {
  price: number;
  changePct?: number;
  source: string;
  marketDataAt?: string;
  syncedAt?: string;
  isStale?: boolean;
  /** 価格の種類 ('market': 現在値, 'close': 終値, 'official': 基準価額) */
  priceKind?: 'market' | 'close' | 'official';
  /** 基準日 (YYYY-MM-DD) */
  baselineDate?: string;
};

export type ForexQuote = {
  price: number;
  changePct?: number;
};

export type IndexQuote = {
  symbol: string;
  changePct?: number;
};
