export type AssetType = 'stock' | 'fund';

export type CostBasisMode = 'broker_snapshot' | 'reconstructed' | 'manual';

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  unitLabel: string;
  notes: string;
  symbol?: string; // Ticker code for API mapping (e.g. 3769)
  
  // Real-time / Live Price Info
  currentPrice: number;
  lastPriceUpdatedAt?: number | null;
  priceSource?: 'manual' | 'batch' | 'derived' | 'api' | 'auto'; // auto for legacy

  // Reconstructed / Calculated Holding Info (System Internal)
  quantity: number;
  averageCost: number;
  marketValue: number;
  unrealizedPnL: number;
  realizedPnL: number;
  
  // Snapshot-based fields (Broker Reported)
  current_quantity?: number;
  current_avg_cost?: number;
  current_price?: number;
  current_valuation?: number;
  current_unrealized_pnl?: number;
  last_synced_at?: number;
  cost_basis_mode?: CostBasisMode;

  // WCM-oriented metrics (Reconstructed Performance)
  total_contributed_capital?: number;
  total_cash_returned?: number;
  net_invested_capital?: number;
  total_return_value?: number;
  total_return_rate?: number;

  // Legacy / Tax Specific
  taxCostBasis?: number; // 税務上の平均取得 (特別分配金での減額対象)
  individualPrincipal?: number; // 個別元本 (取得時の価格をベースに特別分配金で更新)
  
  // Strategy settings
  maxBufferPct?: number; 
  watchZoneEnabled?: boolean; 
  marketScoreEnabled?: boolean; 
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

export type TransactionType = 
  | 'buy' 
  | 'sell' 
  | 'ordinary_distribution' 
  | 'special_distribution' 
  | 'transfer_in' 
  | 'transfer_out' 
  | 'manual_adjustment'
  | 'distribution' // legacy support
  | 'adjustment';  // legacy support
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

// ─── 再配分ルール ─────────────────────────────────────────────────────────────

/** 売却後の資金をどう再配分するかのルール */
export interface AllocationSlice {
  assetId: string;   // 'cash' | 'asset-wcm' | 'asset-invesco' など
  label: string;     // 表示名
  pct: number;       // 割合 0〜100
}

export interface AllocationSchedule {
  label: string;     // 'receivingWeek' | 'nextWeek' | 'weekAfter'
  pct: number;       // その週に投入する割合
}

export interface AllocationRule {
  id: string;
  source: string;                    // 'ab_sell' | 'stock_sell' | 'annual_investment'
  label: string;                     // 表示名
  slices: AllocationSlice[];         // 資産配分
  schedule?: AllocationSchedule[];   // 投入スケジュール（任意）
  monthlyAmount?: number;            // 年間追加投資用
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
  allocationRules?: AllocationRule[];  // 売却後再配分ルール
}
