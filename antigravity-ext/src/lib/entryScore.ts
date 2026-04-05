import type { Asset, TriggerRule, MarketContext, EntryScoreBreakdown, AssetPriceState } from '../types';

export function calculateEntryScore(
  asset: Asset,
  activeRules: TriggerRule[],
  context?: MarketContext,
  priceState?: AssetPriceState
): EntryScoreBreakdown {
  let score = 0;
  const reasons: string[] = [];

  const buyRules = activeRules.filter(r => r.direction === 'buy').sort((a,b) => b.thresholdValue - a.thresholdValue);
  
  if (buyRules.length > 0) {
    const nextBuy = buyRules[0].thresholdValue;
    const price = priceState?.displayPrice || asset.currentPrice;
    
    // Price condition (40 points max)
    const diffPct = (price - nextBuy) / nextBuy;
    if (diffPct <= 0) {
      score += 40;
      reasons.push('買付ライン到達');
    } else if (diffPct <= 0.02) {
      score += 20;
      reasons.push('買付ライン接近(2%以内)');
    } else {
      reasons.push('買付ラインに少々距離あり');
    }
  } else {
      reasons.push('有効な買いトリガーなし');
  }

  // Market context (25 points max)
  let tailwindFlag: 'tailwind' | 'neutral' | 'headwind' = 'neutral';
  if (context?.manualContextLabel) {
      tailwindFlag = context.manualContextLabel;
  } else {
      const usdJpyDelta = context?.usdJpyDeltaPct || 0;
      const usDelta = context?.usIndexDeltaPct || 0;
      const worldDelta = context?.worldIndexDeltaPct || 0;

      let weightedDelta = 0;
      if (asset.id === 'asset-ab') {
          // AB米国成長株: 米国株(SPY) 60% + 為替 40%
          weightedDelta = (usDelta * 0.6) + (usdJpyDelta * 0.4);
          reasons.push(`環境: 米株(${usDelta}%)/為替(${usdJpyDelta.toFixed(1)}%) 判定:${weightedDelta.toFixed(2)}%`);
      } else if (asset.id === 'asset-invesco') {
          // インベスコ世界株: 世界株(VT) 60% + 為替 40%
          weightedDelta = (worldDelta * 0.6) + (usdJpyDelta * 0.4);
          reasons.push(`環境: 世界株(${worldDelta}%)/為替(${usdJpyDelta.toFixed(1)}%) 判定:${weightedDelta.toFixed(2)}%`);
      } else {
          // その他（日本株等）: 為替影響を考慮
          weightedDelta = usdJpyDelta;
          if (usdJpyDelta !== 0) {
              reasons.push(`環境: 為替判定(${usdJpyDelta.toFixed(1)}%)`);
          }
      }

      if (weightedDelta > 0.5) tailwindFlag = 'tailwind';
      else if (weightedDelta < -0.5) tailwindFlag = 'headwind';
  }

  if (tailwindFlag === 'tailwind') {
    score += 25;
  } else if (tailwindFlag === 'headwind') {
    score += 0;
  } else {
    score += 10;
  }

  // Freshness (15 points max)
  const isStale = !asset.lastPriceUpdatedAt || (Date.now() - asset.lastPriceUpdatedAt) > 24 * 60 * 60 * 1000;
  if (!isStale) {
    score += 15;
  } else {
    reasons.push('データ鮮度警告(-15点)');
  }

  // Determine flag
  let flag: 'in_candidate' | 'wait' | 'stop' = 'wait';
  if (score >= 65 && buyRules.length > 0) {
    flag = 'in_candidate';
  } else if (score < 30) {
    flag = 'stop';
  }

  return {
    score,
    flag,
    reasons
  };
}
