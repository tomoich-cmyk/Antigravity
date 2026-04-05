export type AssetType = 'stock' | 'fund';

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  unitLabel: string;
  currentPrice: number;
  averageCost: number;
  quantity: number;
  marketValue: number;
  unrealizedPnL: number;
  realizedPnL: number;
  notes: string;
  symbol?: string; // Ticker code for API mapping (e.g. 3769)
  lastPriceUpdatedAt?: number | null;
  priceSource?: 'manual' | 'batch' | 'derived' | 'api' | 'auto'; // auto for legacy
  maxBufferPct?: number; // 動的判断帯の最大幅 (1.0% = 0.01)
  watchZoneEnabled?: boolean; // 動的判断帯を利用するか
  marketScoreEnabled?: boolean; // 市況補正を利用するか
  taxCostBasis?: number; // 税務上の平均取得 (特別分配金での減額対象)
  individualPrincipal?: number; // 個別元本 (取得時の価格をベースに特別分配金で更新)
}

export type ThresholdType = 'lte' | 'gte' | 'range';
export type DirectionType = 'buy' | 'sell' | 'alert';

export interface TriggerRule {
  id: string;
  assetId: string;
  direction: DirectionType;
  thresholdType: ThresholdType;
  thresholdValue: number;
  quantityPlan: number;
  label: string;
  isEnabled: boolean;
  isCompleted: boolean;
  cooldownUntil: number | null;
}

export type TransactionType = 'buy' | 'sell' | 'distribution' | 'adjustment';
export type TransactionStatus = 'planned' | 'confirmed';

export interface DistributionBreakdown {
  ordinary: number; // 普通分配金
  special: number;  // 特別分配金
}

export interface Transaction {
  id: string;
  assetId: string;
  date: string;
  type: TransactionType;
  quantity: number;
  price: number;
  fee: number;
  tax: number;
  realizedPnL: number;
  note: string;
  status: TransactionStatus;
  isDeleted?: boolean;
  createdAt?: number;
  updatedAt?: number;
  distributionBreakdown?: DistributionBreakdown;
}

export interface CashBucket {
  id: string;
  name: string;
  amount: number;
  purpose: string;
  locked: boolean;
}

export interface NotificationRecord {
  id: string;
  assetId: string;
  message: string;
  triggeredAt: number;
  read: boolean;
  suppressed: boolean;
}

export type PriceKind = 'market' | 'official' | 'reference';
export type PriceSource = 'manual' | 'batch' | 'derived' | 'api' | 'auto';

export interface AssetPriceState {
  assetId: string;
  price: number; // legacy/fallback
  officialPrice?: number;
  referencePrice?: number;
  displayPrice?: number;
  priceKind?: PriceKind | 'close'; 
  priceSource?: PriceSource;
  updatedAt: number;
  lastOfficialUpdatedAt?: number;
  lastReferenceUpdatedAt?: number;
  lastApiSyncedAt?: number;
  snapshotTimestamp?: string;
  marketDataAt?: string; // ISO timestamp from market source
  baselineDate?: string; // YYYY-MM-DD for fund official price
  isStale?: boolean;
  syncedAt?: number; // ISO timestamp equivalent in ms
  source: PriceSource; // legacy mapping
}

export interface SummaryNotification {
  id: string;
  type: 'midday' | 'close' | 'night';
  generatedAt: number;
  subject: string;
  body: string;
  assetsIncluded: string[];
  sent: boolean;
  channel: 'chrome' | 'gmail' | 'export';
  lastCheckedAt?: number;
}

export interface MarketContext {
  usdJpy?: number;
  usdJpyDeltaPct?: number;
  usIndexName?: string;
  usIndexDeltaPct?: number;
  worldIndexDeltaPct?: number;
  manualContextLabel?: 'tailwind' | 'neutral' | 'headwind';
  lastContextUpdatedAt?: number;
  lastApiSyncedAt?: number;
}

export type InvestmentAction = 
  | 'STRONG_BUY' 
  | 'BUY' 
  | 'WATCH' 
  | 'HOLD' 
  | 'REDUCE' 
  | 'SELL' 
  | 'STOP';

export interface FinalDecision {
  action: InvestmentAction;
  label: string;
  colorClass: string;
  reason: string;
}

export interface EntryScoreBreakdown {
  score: number;
  flag: 'in_candidate' | 'wait' | 'stop';
  reasons: string[];
}

export type MarketLabel = 'tailwind' | 'slightly_tailwind' | 'neutral' | 'slightly_headwind' | 'headwind';

export type FinalDecisionType = 
  | 'front_run_candidate'
  | 'normal_candidate'
  | 'watch'
  | 'hold'
  | 'sell_priority'
  | 'sell_approaching'
  | 'avoid';

export interface DynamicWatchZone {
  basePrice: number;
  watchUpper: number;
  watchLower: number;
  maxBufferPct: number;
  appliedBufferPct: number;
  direction: 'buy' | 'sell';
}

export interface FinalDecisionResult {
  baseTriggerHit: boolean;
  distanceToBasePct: number;
  marketScore: number;
  marketLabel: MarketLabel;
  watchZone: DynamicWatchZone;
  finalDecision: FinalDecisionType;
  reasons: string[];
}

export interface TriggerEvaluationResult {
  updatedRules: TriggerRule[];
  newNotifications: NotificationRecord[];
}

export interface PriceSnapshot {
  price: number;
  timestamp: number;
}

export interface AppState {
  version?: number; // schemaVersion, e.g. 2
  assets: Asset[];
  triggerRules: TriggerRule[];
  transactions: Transaction[];
  cashBuckets: CashBucket[];
  notifications: NotificationRecord[];
  priceState?: Record<string, AssetPriceState>;
  marketContext?: MarketContext;
  summaryNotifications?: SummaryNotification[];
  useReferencePriceForTrigger?: boolean; // 新機能：投信参考価格をトリガー判定に用いるかの全体設定
  lastEvaluatedAt?: number;
  notificationHistory?: NotificationRecord[];
}
