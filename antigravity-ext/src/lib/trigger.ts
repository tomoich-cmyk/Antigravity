import type { Asset, TriggerRule, NotificationRecord, TriggerEvaluationResult, AssetPriceState } from '../types';
import { japanHolidayProvider } from './holidays';
import { formatYmdTokyo, toJst, isHolidayTokyo, nextBusinessDay } from './marketClock';

// ─── AB 保守期チェック ────────────────────────────────────────────────────────

/**
 * AB の保守期（売却停止）かどうかを判定する。
 *
 * 保守期条件:
 *   1. 毎月 11 日〜15 日（決算前後バッファ）
 *   2. 金曜 15:00 以降（週末の約定ズレ回避）
 *   3. 祝日の前営業日（翌日休場による約定ズレ回避）
 *   4. 連休前営業日（同上）
 *
 * @param now  判定基準時刻（省略時は現在時刻）
 * @returns    保守期なら { inMaintenance: true, reason: string }
 */
export function checkAbMaintenancePeriod(now?: Date): { inMaintenance: boolean; reason: string } {
  const d = now ?? new Date();
  const jst = toJst(d);

  // ① 毎月 11〜15 日
  if (jst.day >= 11 && jst.day <= 15) {
    return {
      inMaintenance: true,
      reason: `毎月${jst.day}日は保守期（11〜15日）のため売却停止中です。`,
    };
  }

  // ② 金曜 15:00 以降
  if (jst.weekday === 5 && jst.hour >= 15) {
    return {
      inMaintenance: true,
      reason: '金曜15時以降は週末対応のため売却停止中です。',
    };
  }

  // ③ 祝日・連休の前営業日
  // 翌日が休日（祝日 or 土日）かどうかを確認
  const tomorrow = new Date(d.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowYmd = formatYmdTokyo(tomorrow);
  if (isHolidayTokyo(tomorrowYmd, japanHolidayProvider)) {
    // 翌日が休日。さらに連休かもしれないので次の営業日を確認
    const nextBiz = nextBusinessDay(tomorrowYmd, japanHolidayProvider);
    const daysDiff = Math.round(
      (new Date(nextBiz).getTime() - new Date(tomorrowYmd).getTime()) / (24 * 60 * 60 * 1000)
    );
    const reason = daysDiff >= 2
      ? `${tomorrowYmd} から${daysDiff}日間の連休前のため売却停止中です。`
      : `翌日（${tomorrowYmd}）が休場日のため売却停止中です。`;
    return { inMaintenance: true, reason };
  }

  return { inMaintenance: false, reason: '' };
}

// ─── トリガー評価 ─────────────────────────────────────────────────────────────

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

  // AB 保守期チェック（一度だけ判定してループ内で参照）
  const abMaintenance = checkAbMaintenancePeriod(new Date(now));

  for (const rule of updatedRules) {
    if (!rule.isEnabled || rule.isCompleted) continue;

    // クールダウン中ならスキップ (同一ライン重複通知防止)
    if (rule.cooldownUntil && rule.cooldownUntil > now) continue;

    const asset = assets.find(a => a.id === rule.assetId);
    if (!asset || asset.currentPrice <= 0) continue;

    // ── AB 保守期: sell トリガーをスキップ ──────────────────────────────────
    if (rule.assetId === 'asset-ab' && rule.direction === 'sell' && abMaintenance.inMaintenance) {
      continue;
    }

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
      isTriggered = evalPrice >= rule.thresholdValue;
    }

    if (isTriggered) {
      newNotifications.push({
        id: crypto.randomUUID(),
        assetId: asset.id,
        message: `${asset.name}が ${evalPrice.toLocaleString()}円 に到達。${rule.quantityPlan.toLocaleString()}${asset.unitLabel}の ${rule.direction === 'buy' ? '買い' : '売り'} 候補です。`,
        triggeredAt: now,
        read: false,
        suppressed: false,
      });

      // 12時間のクールダウンをつける
      rule.cooldownUntil = now + 12 * 60 * 60 * 1000;
    }
  }

  return { updatedRules, newNotifications };
}
