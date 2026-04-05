import type { Asset, TriggerRule, NotificationRecord, TriggerEvaluationResult, AssetPriceState } from '../types';

export function evaluateTriggers(
  assets: Asset[], 
  rules: TriggerRule[],
  _lastEvaluatedAt?: number,
  priceState?: Record<string, AssetPriceState>,
  useReferencePriceForTrigger?: boolean
): TriggerEvaluationResult {
  const newNotifications: NotificationRecord[] = [];
  const updatedRules = rules.map(r => ({ ...r }));
  const now = Date.now();

  for (const rule of updatedRules) {
    if (!rule.isEnabled || rule.isCompleted) continue;
    
    // クールダウン中ならスキップ (同一ライン重複通知防止)
    if (rule.cooldownUntil && rule.cooldownUntil > now) continue;

    const asset = assets.find(a => a.id === rule.assetId);
    if (!asset || asset.currentPrice <= 0) continue;

    const ps = priceState?.[asset.id];
    let evalPrice = asset.currentPrice;
    
    // IF it's a fund AND we have a reference price AND we're configured to use it
    if (asset.type === 'fund' && useReferencePriceForTrigger && ps?.referencePrice) {
        evalPrice = ps.referencePrice;
    } else if (ps?.displayPrice) {
        evalPrice = ps.displayPrice;
    }

    let isTriggered = false;
    
    if (rule.thresholdType === 'gte') {
      isTriggered = evalPrice >= rule.thresholdValue;
    } else if (rule.thresholdType === 'lte') {
      isTriggered = evalPrice <= rule.thresholdValue;
    } else if (rule.thresholdType === 'range') {
      // 簡易的なレンジ対応
      isTriggered = evalPrice >= rule.thresholdValue;
    }

    if (isTriggered) {
      newNotifications.push({
        id: crypto.randomUUID(),
        assetId: asset.id,
        message: `${asset.name}が ${evalPrice.toLocaleString()}円 に到達。${rule.quantityPlan}${asset.unitLabel}の ${rule.direction === 'buy' ? '買い' : '売り'} 候補です。`,
        triggeredAt: now,
        read: false,
        suppressed: false
      });

      // 12時間のクールダウンをつける
      rule.cooldownUntil = now + (12 * 60 * 60 * 1000); 
    }
  }

  return { updatedRules, newNotifications };
}
