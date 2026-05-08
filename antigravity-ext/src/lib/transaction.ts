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
    unrealizedPnL,
    total_contributed_capital: (asset.total_contributed_capital || 0) + newTxValue
  };
}

export function applySellTransaction(asset: Asset, tx: Transaction): { asset: Asset, realizedPnL: number } {
  if (tx.status === 'planned') return { asset, realizedPnL: 0 };

  const multiplier = asset.type === 'fund' ? 10000 : 1;
  const costBasis = asset.averageCost * (tx.quantity / multiplier);
  
  const saleProceeds = (tx.price * (tx.quantity / multiplier)) - (tx.fee || 0);
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
      realizedPnL: asset.realizedPnL + realizedPnL,
      total_cash_returned: (asset.total_cash_returned || 0) + saleProceeds
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
  let totalCashReturnedDelta = 0;

  if (tx.type === 'ordinary_distribution') {
    realizedPnL = (tx.price * (tx.quantity / multiplier)) - (tx.tax || 0);
    totalCashReturnedDelta = realizedPnL; // Net received
  } else if (tx.type === 'special_distribution') {
    const specAmount = (tx.price * (tx.quantity / multiplier));
    totalCashReturnedDelta = specAmount;
    
    if (asset.quantity > 0) {
      const currentTaxTotalValue = newTaxCostBasis * (asset.quantity / multiplier);
      const newTaxTotalValue = Math.max(0, currentTaxTotalValue - specAmount);
      newTaxCostBasis = newTaxTotalValue / (asset.quantity / multiplier);
      
      const currentPrincipalTotal = newIndividualPrincipal * (asset.quantity / multiplier);
      const newPrincipalTotal = Math.max(0, currentPrincipalTotal - specAmount);
      newIndividualPrincipal = newPrincipalTotal / (asset.quantity / multiplier);
      
      // Update average cost as well for WCM
      const currentTotalValue = asset.averageCost * (asset.quantity / multiplier);
      const newTotalValue = Math.max(0, currentTotalValue - specAmount);
      asset.averageCost = newTotalValue / (asset.quantity / multiplier);
    }
  } else if (tx.distributionBreakdown) {
    // legacy / breakdown support
    realizedPnL = tx.distributionBreakdown.ordinary;
    totalCashReturnedDelta = tx.distributionBreakdown.ordinary + tx.distributionBreakdown.special - (tx.tax || 0);
    
    if (tx.distributionBreakdown.special > 0 && asset.quantity > 0) {
      const currentTaxTotalValue = newTaxCostBasis * (asset.quantity / multiplier);
      const newTaxTotalValue = Math.max(0, currentTaxTotalValue - tx.distributionBreakdown.special);
      newTaxCostBasis = newTaxTotalValue / (asset.quantity / multiplier);
      
      const currentPrincipalTotal = newIndividualPrincipal * (asset.quantity / multiplier);
      const newPrincipalTotal = Math.max(0, currentPrincipalTotal - tx.distributionBreakdown.special);
      newIndividualPrincipal = newPrincipalTotal / (asset.quantity / multiplier);

      const currentTotalValue = asset.averageCost * (asset.quantity / multiplier);
      const newTotalValue = Math.max(0, currentTotalValue - tx.distributionBreakdown.special);
      asset.averageCost = newTotalValue / (asset.quantity / multiplier);
    }
  } else {
    // legacy fallback
    realizedPnL = (tx.price * (tx.quantity / multiplier)) - (tx.fee || 0) - (tx.tax || 0);
    totalCashReturnedDelta = realizedPnL;
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
      realizedPnL: asset.realizedPnL + realizedPnL,
      total_cash_returned: (asset.total_cash_returned || 0) + totalCashReturnedDelta
    },
    realizedPnL
  };
}

export function applyTransferTransaction(asset: Asset, tx: Transaction): Asset {
  if (tx.status === 'planned') return asset;
  const multiplier = asset.type === 'fund' ? 10000 : 1;

  if (tx.type === 'transfer_in') {
    const currentTotalValue = asset.averageCost * (asset.quantity / multiplier);
    const newTxValue = (tx.price * (tx.quantity / multiplier));
    const newQuantity = asset.quantity + tx.quantity;
    const newAverageCost = newQuantity > 0 ? (currentTotalValue + newTxValue) / (newQuantity / multiplier) : asset.averageCost;
    
    return {
      ...asset,
      quantity: newQuantity,
      averageCost: newAverageCost,
      total_contributed_capital: (asset.total_contributed_capital || 0) + newTxValue
    };
  } else if (tx.type === 'transfer_out') {
    const newQuantity = Math.max(0, asset.quantity - tx.quantity);
    const proceeds = (tx.price * (tx.quantity / multiplier));
    return {
      ...asset,
      quantity: newQuantity,
      total_cash_returned: (asset.total_cash_returned || 0) + proceeds
    };
  }
  return asset;
}

export function applyAdjustmentTransaction(asset: Asset, tx: Transaction): Asset {
  if (tx.status === 'planned') return asset;

  const newQuantity = tx.quantity !== undefined ? tx.quantity : asset.quantity;
  const newAverageCost = tx.price !== undefined && tx.price !== 0 ? tx.price : asset.averageCost;
  
  return {
    ...asset,
    quantity: newQuantity,
    averageCost: newAverageCost,
    taxCostBasis: newAverageCost,
    individualPrincipal: newAverageCost
  };
}

export function replayTransactions(baseAsset: Asset, transactions: Transaction[]): Asset {
  const sortedTx = [...transactions].filter(t => !t.isDeleted).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  let currentAsset: Asset = { 
    ...baseAsset,
    taxCostBasis: baseAsset.taxCostBasis || baseAsset.averageCost,
    individualPrincipal: baseAsset.individualPrincipal || baseAsset.averageCost,
    total_contributed_capital: baseAsset.total_contributed_capital || (baseAsset.quantity > 0 ? baseAsset.averageCost * (baseAsset.quantity / (baseAsset.type === 'fund' ? 10000 : 1)) : 0),
    total_cash_returned: baseAsset.total_cash_returned || 0
  };
  
  const multiplier = currentAsset.type === 'fund' ? 10000 : 1;
  
  for (const tx of sortedTx) {
    if (tx.type === 'buy') {
      currentAsset = applyBuyTransaction(currentAsset, tx);
      tx.realizedPnL = 0;
    } else if (tx.type === 'sell') {
      const result = applySellTransaction(currentAsset, tx);
      currentAsset = result.asset;
      tx.realizedPnL = result.realizedPnL;
    } else if (tx.type === 'distribution' || tx.type === 'ordinary_distribution' || tx.type === 'special_distribution') {
      const result = applyDistributionTransaction(currentAsset, tx);
      currentAsset = result.asset;
      tx.realizedPnL = result.realizedPnL;
    } else if (tx.type === 'adjustment' || tx.type === 'manual_adjustment') {
      currentAsset = applyAdjustmentTransaction(currentAsset, tx);
      tx.realizedPnL = 0;
    } else if (tx.type === 'transfer_in' || tx.type === 'transfer_out') {
      currentAsset = applyTransferTransaction(currentAsset, tx);
      tx.realizedPnL = 0;
    }
  }

  // Recalculate market-based fields
  currentAsset.marketValue = (currentAsset.quantity / multiplier) * currentAsset.currentPrice;
  currentAsset.unrealizedPnL = currentAsset.marketValue - ((currentAsset.quantity / multiplier) * currentAsset.averageCost);
  
  // WCM Final Metrics
  currentAsset.net_invested_capital = (currentAsset.total_contributed_capital || 0) - (currentAsset.total_cash_returned || 0);
  currentAsset.total_return_value = currentAsset.marketValue - (currentAsset.net_invested_capital || 0);
  currentAsset.total_return_rate = (currentAsset.total_contributed_capital || 0) > 0 
    ? (currentAsset.total_return_value / currentAsset.total_contributed_capital!) 
    : 0;

  return currentAsset;
}
