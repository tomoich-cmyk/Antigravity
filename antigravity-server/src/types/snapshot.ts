/**
 * MarketSnapshot — サーバーが返す相場スナップショット型
 *
 * 取得元（J-Quants / Alpha Vantage / モック）を問わず、
 * このインターフェースに変換してから返すことで
 * PWA 側と取得ロジックを完全に分離する。
 */
export type MarketSnapshot = {
  /** ISO 8601 形式の取得日時 (UTC) */
  fetchedAt: string;

  stocks: {
    /** GMOPG (3769) */
    gmopg?: StockQuote;
    /** U-NEXT (9418) */
    unext?: StockQuote;
    /** その他の銘柄 (動的キー) */
    [key: string]: StockQuote | undefined;
  };

  context: {
    /** USD/JPY レート */
    usdJpy?: ForexQuote;
    /** 米国株 proxy (例: SPY/QQQ) */
    usProxy?: IndexQuote;
    /** 世界株 proxy (例: VT) */
    worldProxy?: IndexQuote;
  };

  /**
   * スナップショット取得メタ情報（オプション・後方互換）
   * PWA がこのフィールドを知らなくても動作する。
   */
  _meta?: SnapshotMeta;
};

/** スナップショット取得に関するメタ情報 */
export type SnapshotMeta = {
  /** 使用した fetcher 識別名 ('mock' | 'jquants' | ...) */
  fetcher: string;
  /** キャッシュ（TTL内）から返した場合 true */
  cacheHit: boolean;
  /** TTL 超過の stale キャッシュから返した場合 true */
  stale?: boolean;
  /** 一部フィールドの取得に失敗した場合 true */
  partial?: boolean;
  /** フィールドごとのエラーメッセージ (key: "stocks.gmopg" など) */
  errors?: Record<string, string>;
};

export type StockQuote = {
  /** 株価 (円) */
  price: number;
  /** 前日比 (%) — 取得できない場合は undefined */
  changePct?: number;
  /** データソース識別子（例: "jquants:20260331", "yahoo"） */
  source: string;
  /** 市場データの時刻 (ISO 8601) */
  marketDataAt?: string;
  /** サーバーが同期した時刻 (ISO 8601) */
  syncedAt?: string;
  /** データが古いと判断された場合 true */
  isStale?: boolean;
  /** 価格の種類 ('market': 現在値, 'close': 終値, 'official': 基準価額) */
  priceKind?: 'market' | 'close' | 'official';
  /** 基準日 (YYYY-MM-DD) — 特に投資信託などの基準価額の算出日を明示する */
  baselineDate?: string;
};

export type ForexQuote = {
  /** レート (例: 149.8) */
  price: number;
  /** 前日比 (%) */
  changePct?: number;
};

export type IndexQuote = {
  /** ティッカーorシンボル */
  symbol: string;
  /** 前日比 (%) */
  changePct?: number;
};
