import { saveAssetPrice } from './portfolio';
import { loadState, saveState } from './storage';
import type { MarketContext } from '../types';
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

export async function updateAssetPricesAndEvaluate(updates: { assetId: string, price: number, priceSource?: 'manual' | 'batch' }[]) {
  // 1. Save all prices (legacy compatible)
  for (const { assetId, price, priceSource } of updates) {
    await saveAssetPrice(assetId, price, priceSource || 'manual');
  }
  
// 2. Evaluate triggers
  await evaluateAndSaveTriggers();
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
