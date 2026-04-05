import type { Asset, MarketContext, MarketLabel } from '../types';

export interface MarketScoreResult {
  score: number;
  label: MarketLabel;
  reasons: string[];
}

/**
 * 資産ごとに最適化された市況スコアを算出する。
 * スコアレンジ: -100 (最悪) 〜 +100 (最良)
 */
export function calculateMarketScore(
  asset: Asset,
  context?: MarketContext
): MarketScoreResult {
  if (!context) {
    return { score: 0, label: 'neutral', reasons: ['市況データなし'] };
  }

  // 手動ラベルが設定されている場合はそれを優先 (スコアは概算)
  if (context.manualContextLabel) {
    const labelMapping: Record<string, { score: number; label: MarketLabel }> = {
      'tailwind': { score: 80, label: 'tailwind' },
      'neutral': { score: 0, label: 'neutral' },
      'headwind': { score: -80, label: 'headwind' }
    };
    const res = labelMapping[context.manualContextLabel] || { score: 0, label: 'neutral' };
    return { ...res, reasons: [`手動設定: ${context.manualContextLabel}`] };
  }

  const usdJpyDelta = context.usdJpyDeltaPct || 0;
  const usDelta = context.usIndexDeltaPct || 0;
  const worldDelta = context.worldIndexDeltaPct || 0;
  const reasons: string[] = [];

  let weightedDelta = 0;

  if (asset.id === 'asset-ab') {
    // AB米国成長株: USD/JPY (45%), US (45%), World (10%)
    weightedDelta = (usdJpyDelta * 0.45) + (usDelta * 0.45) + (worldDelta * 0.10);
    reasons.push(`米株(${usDelta.toFixed(1)}%), 為替(${usdJpyDelta.toFixed(1)}%), 世界株(${worldDelta.toFixed(1)}%)`);
  } else if (asset.id === 'asset-invesco') {
    // インベスコ世界株: USD/JPY (30%), US (30%), World (40%)
    weightedDelta = (usdJpyDelta * 0.30) + (usDelta * 0.30) + (worldDelta * 0.40);
    reasons.push(`世界株(${worldDelta.toFixed(1)}%), 米株(${usDelta.toFixed(1)}%), 為替(${usdJpyDelta.toFixed(1)}%)`);
  } else {
    // その他（デフォルト）: 為替と世界株を 50/50
    weightedDelta = (usdJpyDelta * 0.5) + (worldDelta * 0.5);
    if (usdJpyDelta !== 0 || worldDelta !== 0) {
      reasons.push(`為替(${usdJpyDelta.toFixed(1)}%), 世界株(${worldDelta.toFixed(1)}%)`);
    }
  }

  // Delta(%) をスコア(-100〜+100)に変換。
  // 1.5% の変動を 100点 満点とする概算。
  let score = Math.max(-100, Math.min(100, (weightedDelta / 1.5) * 100));
  
  // ラベル判定
  let label: MarketLabel = 'neutral';
  if (score >= 70) label = 'tailwind';
  else if (score >= 30) label = 'slightly_tailwind';
  else if (score > -30) label = 'neutral';
  else if (score > -70) label = 'slightly_headwind';
  else label = 'headwind';

  return { score: Math.round(score), label, reasons };
}
