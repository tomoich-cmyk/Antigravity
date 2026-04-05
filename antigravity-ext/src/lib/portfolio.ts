import { loadState, saveState } from './storage';
import type { Asset, Transaction, AssetPriceState } from '../types';
import { replayTransactions } from './transaction';
import { initialData } from './initialData';
import { computeIsStale } from './priceHelpers';

export async function getTransactions(): Promise<Transaction[]> {
  const state = await loadState();
  return state.transactions || [];
}

export async function saveTransactions(transactions: Transaction[]): Promise<void> {
  const state = await loadState();
  state.transactions = transactions;
  await saveState(state);
}

export async function rebuildAsset(assetId: string): Promise<Asset | null> {
  const state = await loadState();
  const baseAsset = initialData.assets.find(a => a.id === assetId);
  if (!baseAsset) return null;

  const txs = state.transactions.filter(t => t.assetId === assetId);
  const rebuiltAsset = replayTransactions(baseAsset, txs);

  // Apply manual price if exists
  if (state.priceState && state.priceState[assetId]) {
    rebuiltAsset.currentPrice = state.priceState[assetId].price;
    rebuiltAsset.lastPriceUpdatedAt = state.priceState[assetId].updatedAt;
    rebuiltAsset.priceSource = state.priceState[assetId].source;
    
    // Recalculate marketValue and unrealizedPnL based on new price
    const multiplier = rebuiltAsset.type === 'fund' ? 10000 : 1;
    rebuiltAsset.marketValue = (rebuiltAsset.quantity / multiplier) * rebuiltAsset.currentPrice;
    rebuiltAsset.unrealizedPnL = rebuiltAsset.marketValue - ((rebuiltAsset.quantity / multiplier) * rebuiltAsset.averageCost);
  }

  // Update asset in state
  const assetIndex = state.assets.findIndex(a => a.id === assetId);
  if (assetIndex >= 0) {
    state.assets[assetIndex] = rebuiltAsset;
    await saveState(state);
  }
  
  return rebuiltAsset;
}

async function updateCashFromTransaction(tx: Transaction, state: any, isRemoval: boolean = false) {
  const bucketIndex = state.cashBuckets.findIndex((b: any) => b.id === 'cash-total');
  if (bucketIndex === -1) return;

  let delta = 0;

  if (tx.type === 'buy') {
    const asset = state.assets.find((a: any) => a.id === tx.assetId);
    const assetMultiplier = asset?.type === 'fund' ? 10000 : 1;
    delta = -((tx.price * (tx.quantity / assetMultiplier)) + (tx.fee || 0));
  } else if (tx.type === 'sell') {
    const asset = state.assets.find((a: any) => a.id === tx.assetId);
    const assetMultiplier = asset?.type === 'fund' ? 10000 : 1;
    delta = (tx.price * (tx.quantity / assetMultiplier)) - (tx.fee || 0) - (tx.tax || 0);
  } else if (tx.type === 'distribution') {
    if (tx.distributionBreakdown) {
      // rule: ordinary + special - tax
      delta = tx.distributionBreakdown.ordinary + tx.distributionBreakdown.special - (tx.tax || 0);
    } else {
      // legacy fallback
      const asset = state.assets.find((a: any) => a.id === tx.assetId);
      const assetMultiplier = asset?.type === 'fund' ? 10000 : 1;
      delta = (tx.price * (tx.quantity / assetMultiplier)) - (tx.fee || 0) - (tx.tax || 0);
    }
  }

  if (isRemoval) delta = -delta;
  
  if (tx.status === 'confirmed') {
    state.cashBuckets[bucketIndex].amount += delta;
  }
}

export async function appendTransaction(tx: Transaction): Promise<void> {
  const state = await loadState();
  
  if (tx.status === 'confirmed') {
    // Sell取引の場合、実現損益を計算して取引オブジェクトに格納する
    if (tx.type === 'sell') {
      const asset = state.assets.find(a => a.id === tx.assetId);
      if (asset) {
        const multiplier = asset.type === 'fund' ? 10000 : 1;
        const saleProceeds = (tx.price * (tx.quantity / multiplier)) - (tx.fee || 0);
        const costBasis = asset.averageCost * (tx.quantity / multiplier);
        tx.realizedPnL = saleProceeds - costBasis;
      }
    }
    
    await updateCashFromTransaction(tx, state);
  }
  
  state.transactions.push(tx);
  await saveState(state);
  
  if (tx.status === 'confirmed') {
    await rebuildAsset(tx.assetId);
  }
}

export async function updateTransaction(tx: Transaction): Promise<void> {
  const state = await loadState();
  const idx = state.transactions.findIndex(t => t.id === tx.id);
  if (idx >= 0) {
    const oldTx = state.transactions[idx];
    
    // 1. 古い取引の影響（現金）を取り消す
    if (oldTx.status === 'confirmed') {
        await updateCashFromTransaction(oldTx, state, true);
    }
    
    // 2. 新しい取引の実現損益を計算（売却の場合）
    if (tx.status === 'confirmed' && tx.type === 'sell') {
      const asset = state.assets.find(a => a.id === tx.assetId);
      if (asset) {
        const multiplier = asset.type === 'fund' ? 10000 : 1;
        const saleProceeds = (tx.price * (tx.quantity / multiplier)) - (tx.fee || 0);
        const costBasis = asset.averageCost * (tx.quantity / multiplier);
        tx.realizedPnL = saleProceeds - costBasis;
      }
    }
    
    // 3. 取引リストを更新し、新しい取引の影響（現金）を適用する
    state.transactions[idx] = tx;
    if (tx.status === 'confirmed') {
        await updateCashFromTransaction(tx, state);
    }
    
    // 4. まとめて保存
    await saveState(state);
    
    // 5. 資産情報を再構築
    if (tx.status === 'confirmed' || oldTx.status === 'confirmed') {
        await rebuildAsset(tx.assetId);
    }
  }
}

export async function softDeleteTransaction(txId: string): Promise<void> {
  const state = await loadState();
  const tx = state.transactions.find(t => t.id === txId);
  if (tx) {
    // confirmed 取引を削除する場合は現金への影響を取り消す
    if (tx.status === 'confirmed') {
      await updateCashFromTransaction(tx, state, true);
    }
    tx.isDeleted = true;
    await saveState(state);
    await rebuildAsset(tx.assetId);
  }
}

export async function saveAssetPrice(
  assetId: string, 
  price: number, 
  source: 'manual' | 'batch' | 'derived' | 'api' | 'auto' = 'manual',
  lastApiSyncedAt?: number,
  snapshotTimestamp?: string,
  priceKind?: 'market' | 'close' | 'official' | 'reference',
  marketDataAt?: string,
  baselineDate?: string
): Promise<void> {
  const state = await loadState();
  if (!state.priceState) state.priceState = {};
  
  const existing = state.priceState[assetId];
  const newKind = priceKind || (existing?.priceKind === 'official' || existing?.priceKind === 'reference' ? existing.priceKind : 'market');
  
  const asset = state.assets.find((a: any) => a.id === assetId);
  const assetClass = asset?.type === 'stock' ? 'stock' : 'fund';
  const syncedIso = new Date(lastApiSyncedAt || Date.now()).toISOString();
  const isStale = computeIsStale({
    assetClass,
    priceKind: newKind as any,
    syncedAt: syncedIso,
    marketDataAt,
    baselineDate,
  });

  state.priceState[assetId] = {
    ...existing,
    assetId,
    price,
    displayPrice: price,
    priceKind: newKind as any,
    updatedAt: Date.now(),
    source, // mapping for legacy
    priceSource: source,
    lastApiSyncedAt: lastApiSyncedAt || Date.now(), // 手動保存時も時刻を入れる
    snapshotTimestamp,
    marketDataAt,
    baselineDate,
    isStale,
  };
  
  await saveState(state);
  await rebuildAsset(assetId);
}

export async function getAssetPriceState(): Promise<Record<string, AssetPriceState>> {
  const state = await loadState();
  return state.priceState || {};
}
