import type { MarketContext } from './index';

export type SyncResult = {
  /** プレビュー用に準備された資産価格のマップ (assetId -> price) */
  stagedAssetPrices: Record<string, number>;
  /** 詳細情報 (assetId -> details) */
  stagedAssetDetails?: Record<string, { priceKind?: string, marketDataAt?: string, baselineDate?: string }>;
  /** プレビュー用に準備された市況データ */
  stagedContext: Partial<MarketContext>;
  /** 成功したキーのリスト */
  updatedAssets: string[];
  /** 成功した市況項目のリスト */
  updatedContextKeys: string[];
  /** 失敗した項目のリスト (エラーメッセージ等) */
  failedKeys: string[];
  /** スキップされた項目のリスト */
  skippedKeys: string[];
  /** 古い可能性がある項目のリスト */
  staleKeys: string[];
  /** 警告メッセージ */
  warnings: string[];
  /** サーバーから取得した日時 */
  fetchedAt?: string;
  /** スナップショット自体のタイムスタンプ */
  snapshotTimestamp?: string;
};

export type SyncPreviewResult = {
  success: boolean;
  data?: SyncResult;
  error?: string;
};
