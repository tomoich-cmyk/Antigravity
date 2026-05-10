import { saveAssetPrice, saveQuoteSnapshot } from './portfolio';
import { loadState, saveState } from './storage';
import type { MarketContext } from '../types';
import type { QuoteSnapshot } from '../types/market';
import { evaluateTriggers } from './trigger';
import { dispatchNotifications } from './notifications';

export async function evaluateAndSaveTriggers() {
  const state = await loadState();
  const result = evaluateTriggers(state.assets, state.triggerRules, state.lastEvaluatedAt || 0, state.priceState, state.useReferencePriceForTrigger);
  
  state.triggerRules = result.updatedRules;
  state.lastEvaluatedAt = Date.now();
  await saveState(state);

  if (result.newNotifications.length > 0) {
    await dispatchNotifications(result.newNotifications);
  }
}

/** APIから取得した株価を確定保存する */
export async function saveApiPrice(
  assetId: string, 
  price: number, 
  lastApiSyncedAt?: number, 
  snapshotTimestamp?: string,
  priceKind?: 'market' | 'close' | 'official' | 'reference',
  marketDataAt?: string,
  baselineDate?: string
) {
  await saveAssetPrice(assetId, price, 'api', lastApiSyncedAt, snapshotTimestamp, priceKind, marketDataAt, baselineDate);
  // トリガー再評価は呼び出し側で一括で行うためここでは不要（計画の通り）
}

/** スナップショットから市況情報を確定保存する */
export async function saveMarketContextFromSnapshot(
  context: Partial<MarketContext>,
  lastApiSyncedAt?: number
) {
  const state = await loadState();
  state.marketContext = {
    ...state.marketContext,
    ...context,
    lastContextUpdatedAt: Date.now(),
    lastApiSyncedAt
  };
  await saveState(state);
}

/**
 * QuoteSnapshot[] を一括保存してトリガー再評価する。
 * snapshotAdapter からの自動取得フローで使用。
 */
export async function applyQuoteSnapshots(quotes: QuoteSnapshot[]): Promise<void> {
  for (const quote of quotes) {
    await saveQuoteSnapshot(quote);
  }
  await evaluateAndSaveTriggers();
}

export async function saveBatchPrices(updates: { assetId: string, price: number }[], marketDataAt?: string) {
  for (const { assetId, price } of updates) {
    await saveAssetPrice(assetId, price, 'batch', Date.now(), undefined, undefined, marketDataAt);
  }
  await evaluateAndSaveTriggers();
}

export async function saveOfficialFundPrice(assetId: string, officialPrice: number, baselineDate?: string) {
  // Use the refined saveAssetPrice to ensure all fields (including sync timestamp) are set correctly
  await saveAssetPrice(
    assetId, 
    officialPrice, 
    'manual', 
    Date.now(), 
    undefined, 
    'official', 
    undefined, 
    baselineDate
  );
  await evaluateAndSaveTriggers();
}

export async function saveReferenceFundPrice(assetId: string, referencePrice: number, baselineDate?: string) {
  await saveAssetPrice(
    assetId,
    referencePrice,
    'manual',
    Date.now(),
    undefined,
    'reference',
    undefined,
    baselineDate
  );
  await evaluateAndSaveTriggers();
}

/**
 * 平均取得単価・個別元本（税務上）を手動更新する。
 *
 * 特別分配金を受け取った場合や、証券会社の残高確認後に
 * 手動で補正する用途を想定。
 *
 * - averageCost      : 新しい平均取得単価（任意）
 * - taxCostBasis     : 税務上の個別元本（任意）
 * - individualPrincipal : 個別元本（任意）
 *
 * 変更後に unrealizedPnL / marketValue を自動再計算する。
 */
export async function saveAssetCostBasis(
  assetId: string,
  updates: {
    averageCost?: number;
    taxCostBasis?: number;
    individualPrincipal?: number;
  }
): Promise<void> {
  const state = await loadState();
  const idx = state.assets.findIndex(a => a.id === assetId);
  if (idx < 0) return;

  const asset = { ...state.assets[idx] };

  if (updates.averageCost !== undefined)        asset.averageCost        = updates.averageCost;
  if (updates.taxCostBasis !== undefined)       asset.taxCostBasis       = updates.taxCostBasis;
  if (updates.individualPrincipal !== undefined) asset.individualPrincipal = updates.individualPrincipal;

  // unrealizedPnL / marketValue を再計算
  const price = asset.currentPrice;
  if (price > 0 && asset.quantity > 0) {
    const isFund = asset.type === 'fund';
    const divisor = isFund ? 10000 : 1;
    asset.marketValue    = (price / divisor) * asset.quantity;
    asset.unrealizedPnL  = ((price - asset.averageCost) / divisor) * asset.quantity;
  }

  state.assets[idx] = asset;
  await saveState(state);
  await evaluateAndSaveTriggers();
}
