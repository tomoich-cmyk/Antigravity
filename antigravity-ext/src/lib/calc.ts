import type { Asset, Transaction } from '../types';

export function calculateExecution(
  asset: Asset, 
  tx: Transaction
): { updatedAsset: Asset, realizedDelta: number } {
  let newQuantity = asset.quantity;
  let newAverageCost = asset.averageCost;
  let realizedPnLDelta = 0;

  if (tx.type === 'buy') {
    // 【買い】平均取得価額の加重平均計算 (手数料含む)
    const currentTotalValue = asset.averageCost * asset.quantity;
    const newTxValue = (tx.price * tx.quantity) + (tx.fee || 0);
    
    newQuantity = asset.quantity + tx.quantity;
    if (newQuantity > 0) {
      newAverageCost = (currentTotalValue + newTxValue) / newQuantity;
    }

  } else if (tx.type === 'sell') {
    // 【売り】実現損益の計算 (平均法ベース)
    const costBasis = asset.averageCost * tx.quantity;
    const saleProceeds = (tx.price * tx.quantity) - (tx.fee || 0);
    
    realizedPnLDelta = saleProceeds - costBasis;
    newQuantity = Math.max(0, asset.quantity - tx.quantity);
    // 平均取得価額は変動しない
  }

  // 評価額と含み損益の更新
  const marketValue = newQuantity * asset.currentPrice;
  const unrealizedPnL = marketValue - (newQuantity * newAverageCost);

  return {
    updatedAsset: {
      ...asset,
      quantity: newQuantity,
      averageCost: newAverageCost,
      marketValue,
      unrealizedPnL,
      realizedPnL: asset.realizedPnL + realizedPnLDelta
    },
    realizedDelta: realizedPnLDelta
  };
}
