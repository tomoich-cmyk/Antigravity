import type { 
  Asset, 
  DynamicWatchZone, 
  FinalDecisionResult, 
  FinalDecisionType, 
  MarketLabel, 
} from '../types';
import type { MarketScoreResult } from './marketScore';
import { REASON_MESSAGES } from '../constants/messages';

/**
 * 価格、動的判断帯、市況スコアを統合して、最終判定を下す。
 * Dynamic Watch Zone v1 仕様 (Section 6)
 */
export function evaluateFinalDecision(
  _asset: Asset,
  price: number,
  watchZone: DynamicWatchZone,
  market: MarketScoreResult
): FinalDecisionResult {
  
  const { direction, basePrice, watchUpper, watchLower } = watchZone;
  const { score, label } = market;
  const reasons: string[] = [...market.reasons];

  let decision: FinalDecisionType = 'hold';

  // 1. 基礎情報の計算
  const distanceToBasePct = (price - basePrice) / basePrice;
  const baseTriggerHit = direction === 'buy' ? price <= basePrice : price >= basePrice;

  // 2. 判定マトリクス (Section 6.1 / 6.2)
  if (direction === 'buy') {
    // 6.1 買い系判定
    if (price <= basePrice) {
      // 条件 A: ベース以下
      if (score >= -29) {
        // 中立以上
        decision = 'normal_candidate';
        reasons.push(score >= 30 ? REASON_MESSAGES.buy.reachedTailwind : REASON_MESSAGES.buy.reached);
      } else {
        // 逆風 (-30以下)
        decision = 'watch';
        reasons.push(REASON_MESSAGES.buy.heldByHeadwind);
      }
    } else if (price <= watchUpper) {
      // 条件 B: ベースから WatchUpper の間
      if (score >= 30) {
        decision = 'front_run_candidate';
        reasons.push(REASON_MESSAGES.buy.frontRun(watchUpper));
      } else if (score > -30) {
        decision = 'watch';
        reasons.push(REASON_MESSAGES.buy.watchClose);
      } else {
        decision = 'hold';
        reasons.push(REASON_MESSAGES.buy.noEarlyBuy);
      }
    } else if (price < watchLower) {
      // 条件 C: WatchLower 以下 (激リバ期待など、基本は normal_candidate)
      decision = 'normal_candidate';
      reasons.push(REASON_MESSAGES.buy.deepValue);
    } else {
      // 条件 D: WatchUpper 超過
      decision = 'hold';
      reasons.push(REASON_MESSAGES.buy.outOfRange);
    }
  } else {
    // 6.2 売り系判定
    if (price >= basePrice) {
      // 条件 A: ベース以上
      if (score <= -30) {
        decision = 'sell_priority';
        reasons.push(REASON_MESSAGES.sell.reachedHeadwind);
      } else if (score < 30) {
        decision = 'normal_candidate';
        reasons.push(REASON_MESSAGES.sell.reached);
      } else {
        decision = 'watch';
        reasons.push(REASON_MESSAGES.sell.heldByTailwind);
      }
    } else if (price >= watchLower) {
      // 条件 B: WatchLower から ベース の間
      if (score <= -30) {
        decision = 'sell_approaching';
        reasons.push(REASON_MESSAGES.sell.approachingHeadwind(watchLower));
      } else if (score < 30) {
        decision = 'watch';
        reasons.push(REASON_MESSAGES.sell.watchClose);
      } else {
        decision = 'hold';
        reasons.push(REASON_MESSAGES.sell.noEarlySell);
      }
    } else if (price > watchUpper) {
      // 条件 C: WatchUpper 超過 (追い風継続)
      decision = 'watch';
      reasons.push(REASON_MESSAGES.sell.strongTailwind);
    } else {
      // 条件 D
      decision = 'hold';
      reasons.push(REASON_MESSAGES.sell.outOfRange);
    }
  }

  return {
    baseTriggerHit,
    distanceToBasePct,
    marketScore: score,
    marketLabel: label as MarketLabel,
    watchZone,
    finalDecision: decision,
    reasons
  };
}
