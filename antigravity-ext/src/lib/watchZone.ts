import type { DynamicWatchZone } from '../types';

/**
 * マーケットスコアを元に動的判断帯 (Dynamic Watch Zone) を構築する。
 */
export function buildDynamicWatchZone(
  basePrice: number,
  direction: 'buy' | 'sell',
  marketScore: number,
  maxBufferPct: number = 0.01 // 1.0% デフォルト
): DynamicWatchZone {
  
  let positiveBufferPct = 0;
  let negativeBufferPct = 0;

  // 100点満点を最大バッファ幅とする変換。
  // スコアの絶対値に比例してバッファを広げる。
  const intensity = Math.abs(marketScore) / 100;
  const appliedBufferPct = maxBufferPct * intensity;

  // 効かせる方向の決定 (Section 5.3 / 5.4)
  if (direction === 'buy') {
    if (marketScore >= 0) {
      // 追い風: 上側 (高値側) も許容して前倒しINを誘発
      positiveBufferPct = appliedBufferPct;
      negativeBufferPct = maxBufferPct * 0.2; // 逆側は少し残す (例: 0.2%)
    } else {
      // 逆風: 下側 (安値側) を広げて、より安く買えるまで待つ
      negativeBufferPct = appliedBufferPct;
      positiveBufferPct = maxBufferPct * 0.1; // 逆側は最小限
    }
  } else {
    // sell 方向
    if (marketScore >= 0) {
      // 追い風: 上側 (さらなる高値) への伸びを期待して様子見
      positiveBufferPct = appliedBufferPct;
      negativeBufferPct = maxBufferPct * 0.1;
    } else {
      // 逆風: 下側 (利益確定ラインの手前) でも売却を検討
      negativeBufferPct = appliedBufferPct;
      positiveBufferPct = maxBufferPct * 0.2;
    }
  }

  return {
    basePrice,
    watchUpper: Math.round(basePrice * (1 + positiveBufferPct)),
    watchLower: Math.round(basePrice * (1 - negativeBufferPct)),
    maxBufferPct,
    appliedBufferPct: Math.max(positiveBufferPct, negativeBufferPct),
    direction
  };
}
