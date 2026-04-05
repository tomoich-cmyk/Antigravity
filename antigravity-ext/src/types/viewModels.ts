import type { FreshnessView, QuoteKind } from './market';

export type PriceSource = "manual" | "api" | "preview" | "fallback" | "batch" | "derived" | "auto";
export type PriceKind = "market" | "official" | "reference" | "snapshot" | "close";

export type AssetPriceMeta = {
  priceSource: PriceSource;
  priceKind: PriceKind;
  /** FreshnessEngine が使う正規の価格種別 */
  quoteKind?: QuoteKind;
  syncedAt?: string;       // アプリへ保存した時刻 ISO string
  marketDataAt?: string;   // 市場データ自体の時刻 ISO string
  baselineDate?: string;   // 投信用: 基準日 (YYYY-MM-DD)
  isStale?: boolean;       // stale 判定済みフラグ (FreshnessEngine から導出)
  freshnessView?: FreshnessView; // 鮮度詳細 (asOfLabel / level / canPretendCurrent 等)
};

export type AssetCardViewModel = {
  id: string;
  name: string;
  assetClass: "stock" | "fund";
  unitLabel: string;

  displayPrice?: number;
  priceMeta: AssetPriceMeta;

  quantity?: number;
  averageCost?: number;
  marketValue?: number;
  unrealizedPnL?: number;

  decisionKey: string;          // 内部的なキー (hold, sell_priority等)
  decisionLabel: string;        // 表示用: "ホールド継続"
  decisionColor: string;        // 背景色クラス
  decisionIcon: string;         // アイコン

  environmentLabel?: string;    // "やや追い風"
  environmentScore?: number;    // 36
  decisionBandText?: string;    // "10,190〜10,237円"
  reasonText?: string;          // "基準売却価格に未到達"

  basePriceText?: string;       // "売 10,200円"
  diffText?: string;            // "売まであと266円"
  diffColor?: string;           // 文字色クラス
};
