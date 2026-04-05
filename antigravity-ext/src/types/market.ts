// ─── 資産クラス ──────────────────────────────────────────────────────────────
export type AssetClass = 'jp_stock' | 'jp_etf' | 'jp_reit' | 'mutual_fund';

// ─── 価格の種類 ───────────────────────────────────────────────────────────────
/**
 * intraday  : 場中リアルタイム/遅延気配
 * close     : 当日確定終値 (15:30 以降)
 * nav       : 投信基準価額 (翌営業日以降確定)
 * reference : 参考価格 (前日基準価額等, 公式未確定)
 */
export type QuoteKind = 'intraday' | 'close' | 'nav' | 'reference';

// ─── データソース ─────────────────────────────────────────────────────────────
export type SourceId =
  | 'manual'
  | 'snapshot_server'
  | 'broker_import'
  | 'mock';

export type SourceMode =
  | 'realtime'
  | 'delayed'
  | 'eod'
  | 'daily_nav'
  | 'manual'
  | 'mock';

// ─── QuoteSnapshot: 時刻モデルの中核 ─────────────────────────────────────────
/**
 * アプリ内で価格を保持する際の正規フォーマット。
 * - syncedAt    : アプリがデータを「取り込んだ」時刻 (= Date.now() 相当の ISO string)
 * - marketDataAt: 価格そのものが成立した市場時刻 (null の場合は不明)
 * - baselineDate: YYYY-MM-DD。投信は基準日、株式は当日日付
 */
export interface QuoteSnapshot {
  assetId: string;
  assetClass: AssetClass;
  value: number;
  currency: 'JPY';
  quoteKind: QuoteKind;
  source: {
    id: SourceId;
    mode: SourceMode;
    label: string;
  };
  /** アプリにデータが到着した時刻 (ISO string, 必須) */
  syncedAt: string;
  /** 価格が成立した市場時刻 (ISO string, 不明なら null) */
  marketDataAt?: string | null;
  /** YYYY-MM-DD: 価格の「営業日基準日」 */
  baselineDate: string;
}

// ─── 市場セッション ───────────────────────────────────────────────────────────
/**
 * 東京市場のセッション区分 (JST)
 * pre_open    : 8:00〜9:00
 * morning     : 9:00〜11:30
 * lunch_break : 11:30〜12:30
 * afternoon   : 12:30〜15:30
 * after_close : 15:30〜
 * holiday     : 土日・祝日
 */
export type MarketSession =
  | 'pre_open'
  | 'morning'
  | 'lunch_break'
  | 'afternoon'
  | 'after_close'
  | 'holiday';

// ─── 鮮度レベル ───────────────────────────────────────────────────────────────
/**
 * fresh   : 最新と見なせる
 * lagging : 遅延あり (今日のデータだが古め)
 * stale   : 陳腐 (前日以前)
 * unknown : 判定不能
 */
export type FreshnessLevel = 'fresh' | 'lagging' | 'stale' | 'unknown';

// ─── 鮮度理由コード ───────────────────────────────────────────────────────────
export type FreshnessReason =
  | 'market_closed'       // 現在が閉場中で価格は前回終値
  | 'provider_delay'      // データプロバイダの遅延 (20分以上)
  | 'manual_old'          // 手動入力値が古い
  | 'missing_market_time' // marketDataAt が不明
  | 'nav_not_updated'     // 投信基準価額が未更新
  | 'holiday_gap'         // 祝日をまたいで古くなった
  | 'unsupported'         // 未サポート組み合わせ
  | 'unknown';            // 不明

// ─── FreshnessView: UI 表示用の鮮度情報 ──────────────────────────────────────
export interface FreshnessView {
  /** isStale: true なら強調警告 */
  isStale: boolean;
  /** 詳細レベル */
  level: FreshnessLevel;
  /** 理由コード (オプション) */
  reason?: FreshnessReason;
  /**
   * 価格の基準時刻ラベル (例: "4/3 終値", "4/4 11:30時点", "4/3 基準価額")
   * UI でそのまま表示する
   */
  asOfLabel: string;
  /**
   * true の場合「現在値」と表記してよい
   * (場中 intraday かつ 20分以内)
   */
  canPretendCurrent: boolean;
  /** 追加メッセージ (ツールチップ等) */
  message?: string;
}
