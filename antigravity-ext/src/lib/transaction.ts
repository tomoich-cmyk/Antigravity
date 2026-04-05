import type { Asset, Transaction } from '../types';

export function applyBuyTransaction(asset: Asset, tx: Transaction): Asset {
  if (tx.status === 'planned') return asset;

  const multiplier = asset.type === 'fund' ? 10000 : 1;
  const currentTotalValue = asset.averageCost * (asset.quantity / multiplier);
  const currentTaxTotalValue = (asset.taxCostBasis || asset.averageCost) * (asset.quantity / multiplier);
  
  const newTxValue = (tx.price * (tx.quantity / multiplier)) + (tx.fee || 0);
  
  const newQuantity = asset.quantity + tx.quantity;
  const newAverageCost = newQuantity > 0 ? (currentTotalValue + newTxValue) / (newQuantity / multiplier) : asset.averageCost;
  const newTaxCostBasis = newQuantity > 0 ? (currentTaxTotalValue + newTxValue) / (newQuantity / multiplier) : (asset.taxCostBasis || asset.averageCost);

  const marketValue = (newQuantity / multiplier) * asset.currentPrice;
  const unrealizedPnL = marketValue - ((newQuantity / multiplier) * newAverageCost);

  return {
    ...asset,
    quantity: newQuantity,
    averageCost: newAverageCost,
    taxCostBasis: newTaxCostBasis,
    individualPrincipal: newTaxCostBasis, // 取得時は税務上の平均取得と同じ
    marketValue,
    unrealizedPnL
  };
}

export function applySellTransaction(asset: Asset, tx: Transaction): { asset: Asset, realizedPnL: number } {
  if (tx.status === 'planned') return { asset, realizedPnL: 0 };

  const multiplier = asset.type === 'fund' ? 10000 : 1;
  const costBasis = asset.averageCost * (tx.quantity / multiplier);
  
  const saleProceeds = (tx.price * (tx.quantity / multiplier)) - (tx.fee || 0);
  // 実現損益は税務上の元本（取得価額）との差分で計算するのが正確だが、
  // ユーザーの指示「普通分配金だけを反映」に基づき、売却時の実現損益は平均取得ベースを維持
  const realizedPnL = saleProceeds - costBasis;
  
  const newQuantity = Math.max(0, asset.quantity - tx.quantity);
  const marketValue = (newQuantity / multiplier) * asset.currentPrice;
  const unrealizedPnL = marketValue - ((newQuantity / multiplier) * asset.averageCost);

  return {
    asset: {
      ...asset,
      quantity: newQuantity,
      marketValue,
      unrealizedPnL,
      realizedPnL: asset.realizedPnL + realizedPnL
    },
    realizedPnL
  };
}

export function applyDistributionTransaction(asset: Asset, tx: Transaction): { asset: Asset, realizedPnL: number } {
  if (tx.status === 'planned') return { asset, realizedPnL: 0 };

  const multiplier = asset.type === 'fund' ? 10000 : 1;
  let realizedPnL = 0;
  let newTaxCostBasis = asset.taxCostBasis || asset.averageCost;
  let newIndividualPrincipal = asset.individualPrincipal || asset.averageCost;

  if (tx.distributionBreakdown) {
    // 1. 普通分配金 -> 税務サマリ（実現損益）へ入れる
    realizedPnL = tx.distributionBreakdown.ordinary;
    
    // 2. 特別分配金 -> 元本管理（taxCostBasis / individualPrincipal）を減額
    if (tx.distributionBreakdown.special > 0 && asset.quantity > 0) {
      // 特別分配金は「1万口あたりの分配額」ではなく「受取総額」として扱われている想定
      // 指定されたルール「特別分配金：元本を減額」を適用
      const currentTaxTotalValue = newTaxCostBasis * (asset.quantity / multiplier);
      const newTaxTotalValue = Math.max(0, currentTaxTotalValue - tx.distributionBreakdown.special);
      newTaxCostBasis = newTaxTotalValue / (asset.quantity / multiplier);
      
      const currentPrincipalTotal = newIndividualPrincipal * (asset.quantity / multiplier);
      const newPrincipalTotal = Math.max(0, currentPrincipalTotal - tx.distributionBreakdown.special);
      newIndividualPrincipal = newPrincipalTotal / (asset.quantity / multiplier);
    }
  } else {
    // legacy support
    realizedPnL = (tx.price * (tx.quantity / multiplier)) - (tx.fee || 0) - (tx.tax || 0);
  }

  const marketValue = (asset.quantity / multiplier) * asset.currentPrice;
  const unrealizedPnL = marketValue - ((asset.quantity / multiplier) * asset.averageCost);

  return {
    asset: {
      ...asset,
      taxCostBasis: newTaxCostBasis,
      individualPrincipal: newIndividualPrincipal,
      marketValue,
      unrealizedPnL,
      realizedPnL: asset.realizedPnL + realizedPnL
    },
    realizedPnL
  };
}

export function applyAdjustmentTransaction(asset: Asset, tx: Transaction): Asset {
  if (tx.status === 'planned') return asset;

  const multiplier = asset.type === 'fund' ? 10000 : 1;
  const newQuantity = tx.quantity !== undefined ? tx.quantity : asset.quantity;
  const newAverageCost = tx.price !== undefined && tx.price !== 0 ? tx.price : asset.averageCost;
  const newTaxCostBasis = tx.price !== undefined && tx.price !== 0 ? tx.price : (asset.taxCostBasis || asset.averageCost);
  
  const marketValue = (newQuantity / multiplier) * asset.currentPrice;
  const unrealizedPnL = marketValue - ((newQuantity / multiplier) * newAverageCost);

  return {
    ...asset,
    quantity: newQuantity,
    averageCost: newAverageCost,
    taxCostBasis: newTaxCostBasis,
    individualPrincipal: newTaxCostBasis,
    marketValue,
    unrealizedPnL
  };
}

export function replayTransactions(baseAsset: Asset, transactions: Transaction[]): Asset {
  const sortedTx = [...transactions].filter(t => !t.isDeleted).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  let currentAsset: Asset = { 
    ...baseAsset,
    taxCostBasis: baseAsset.taxCostBasis || baseAsset.averageCost,
    individualPrincipal: baseAsset.individualPrincipal || baseAsset.averageCost
  };
  
  const multiplier = currentAsset.type === 'fund' ? 10000 : 1;
  currentAsset.marketValue = (currentAsset.quantity / multiplier) * currentAsset.currentPrice;
  currentAsset.unrealizedPnL = currentAsset.marketValue - ((currentAsset.quantity / multiplier) * currentAsset.averageCost);
  
  for (const tx of sortedTx) {
    if (tx.type === 'buy') {
      currentAsset = applyBuyTransaction(currentAsset, tx);
      tx.realizedPnL = 0;
    } else if (tx.type === 'sell') {
      const result = applySellTransaction(currentAsset, tx);
      currentAsset = result.asset;
      tx.realizedPnL = result.realizedPnL;
    } else if (tx.type === 'distribution') {
      const result = applyDistributionTransaction(currentAsset, tx);
      currentAsset = result.asset;
      tx.realizedPnL = result.realizedPnL;
    } else if (tx.type === 'adjustment') {
      currentAsset = applyAdjustmentTransaction(currentAsset, tx);
      tx.realizedPnL = 0;
    }
  }

  return currentAsset;
}
