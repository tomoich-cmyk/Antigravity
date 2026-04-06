import type { Asset, AppState } from '../types';
import type { AssetCardViewModel, AssetPriceMeta, PriceSource as ViewPriceSource, PriceKind } from '../types/viewModels';
import type { QuoteSnapshot, AssetClass, QuoteKind } from '../types/market';
import { calculateMarketScore } from './marketScore';
import { buildDynamicWatchZone } from './watchZone';
import { evaluateFinalDecision } from './decision';
import { evaluateFreshness } from './freshness';
import { deriveBaselineDate } from './baselineDate';
import { logFreshnessAudit } from './freshnessAudit';
import { LABELS } from '../constants/labels';
import { MESSAGES } from '../constants/messages';
import { DECISION_LABEL_MAP, ENVIRONMENT_LABEL_MAP } from '../constants/enums';

// ─── 型マッピングヘルパー ─────────────────────────────────────────────────────

function toAssetClass(type: 'stock' | 'fund'): AssetClass {
  return type === 'fund' ? 'mutual_fund' : 'jp_stock';
}

function toQuoteKind(priceKind: PriceKind): QuoteKind {
  if (priceKind === 'official') return 'nav';
  if (priceKind === 'reference') return 'reference';
  if (priceKind === 'close') return 'close';
  // 'market' | 'snapshot' → intraday
  return 'intraday';
}

function toSourceId(source: ViewPriceSource): QuoteSnapshot['source'] {
  if (source === 'api' || source === 'batch') {
    return { id: 'snapshot_server', mode: 'delayed', label: '自動取得' };
  }
  return { id: 'manual', mode: 'manual', label: '手動' };
}

export function toAssetCardViewModel(
  asset: Asset,
  state: AppState
): AssetCardViewModel {
  const rules = state.triggerRules;
  const marketContext = state.marketContext;
  const priceState = state.priceState?.[asset.id];
  const useReferencePriceForTrigger = state.useReferencePriceForTrigger;

  const activeRules = rules.filter(r => r.assetId === asset.id && r.isEnabled && !r.isCompleted);
  
  // 1. 市場スコア・市況の算出
  const marketResult = calculateMarketScore(asset, marketContext);

  // 2. 表示価格の決定
  let displayPrice = asset.currentPrice;
  if (asset.type === 'fund' && useReferencePriceForTrigger && priceState?.referencePrice) {
      displayPrice = priceState.referencePrice;
  } else if (priceState?.displayPrice) {
      displayPrice = priceState.displayPrice;
  }

  // 3. 判定ロジック
  const buyRules = activeRules.filter(r => r.direction === 'buy').sort((a,b) => b.thresholdValue - a.thresholdValue);
  const sellRules = activeRules.filter(r => r.direction === 'sell').sort((a,b) => a.thresholdValue - b.thresholdValue);
  const primaryRule = asset.quantity > 0 && sellRules.length > 0 ? sellRules[0] : 
                      buyRules.length > 0 ? buyRules[0] : null;

  const watchZone = primaryRule 
    ? buildDynamicWatchZone(primaryRule.thresholdValue, primaryRule.direction as 'buy' | 'sell', marketResult.score, asset.maxBufferPct || 0.01)
    : null;

  const decisionResult = watchZone 
    ? evaluateFinalDecision(asset, displayPrice, watchZone, marketResult)
    : null;

  const decisionKey = decisionResult?.finalDecision || 'hold';
  const decisionLabel = DECISION_LABEL_MAP[decisionKey as keyof typeof DECISION_LABEL_MAP] || LABELS.status.hold;

  // 4. スタイル設定
  const styleMap: Record<string, { color: string, icon: string }> = {
    'front_run_candidate': { color: 'bg-indigo-600 text-white', icon: '🔥' },
    'normal_candidate': { color: 'bg-blue-600 text-white', icon: '🔵' },
    'watch': { color: 'bg-amber-500 text-white', icon: '👀' },
    'hold': { color: 'bg-slate-700 text-slate-100', icon: '⚪' },
    'sell_priority': { color: 'bg-rose-600 text-white', icon: '🔴' },
    'sell_approaching': { color: 'bg-rose-500 text-white', icon: '📢' },
    'avoid': { color: 'bg-slate-900 text-white', icon: '⚠️' }
  };

  const style = styleMap[decisionKey] || styleMap['hold'];

  // 5. 差（あと○円）の計算
  let diffText = "";
  let diffColor = "text-slate-100";
  if (primaryRule) {
    const diff = Math.abs(primaryRule.thresholdValue - displayPrice);
    diffText = primaryRule.direction === 'sell' ? MESSAGES.diffToSell(diff) : MESSAGES.diffToBuy(diff);
    diffColor = primaryRule.direction === 'sell' ? "text-rose-400" : "text-indigo-400";
  }

  // 6. 鮮度判定 (FreshnessEngine)
  const rawSource = priceState?.priceSource as string;
  let priceSource: ViewPriceSource = "manual";
  if (rawSource === 'api') priceSource = "api";
  else if (rawSource === 'batch') priceSource = "batch";
  else if (rawSource === 'preview') priceSource = "preview";
  else if (rawSource === 'fallback') priceSource = "fallback";

  let priceKind: PriceKind = (priceState?.priceKind as PriceKind) || (asset.type === 'fund' ? "official" : "market");

  // 国内株式の「前回取得値」判定 (legacy priceKind 補正)
  if (asset.type === 'stock' && priceState?.marketDataAt && priceSource === 'api') {
    const md = new Date(priceState.marketDataAt);
    const now = new Date();
    const isSameDay = md.getFullYear() === now.getFullYear() &&
                      md.getMonth()    === now.getMonth() &&
                      md.getDate()     === now.getDate();
    if (!isSameDay) priceKind = 'snapshot';
  }

  const syncedAt = priceState?.lastApiSyncedAt
    ? new Date(priceState.lastApiSyncedAt).toISOString()
    : undefined;

  const meta: AssetPriceMeta = {
    priceSource,
    priceKind,
    syncedAt,
    marketDataAt: priceState?.marketDataAt,
    baselineDate: priceState?.baselineDate,
  };

  // QuoteSnapshot を組み立てて FreshnessEngine で評価
  const now = new Date();
  const assetClass = toAssetClass(asset.type);
  const quoteKind  = toQuoteKind(priceKind);
  const resolvedBaseline = meta.baselineDate ?? deriveBaselineDate({
    assetClass,
    quoteKind,
    marketDataAt: meta.marketDataAt,
    now,
  });

  const quote: QuoteSnapshot = {
    assetId:      asset.id,
    assetClass,
    value:        displayPrice,
    currency:     'JPY',
    quoteKind,
    source:       toSourceId(priceSource),
    syncedAt:     syncedAt ?? now.toISOString(),
    marketDataAt: meta.marketDataAt ?? null,
    baselineDate: resolvedBaseline,
  };

  const freshnessView = evaluateFreshness({ quote, now });
  logFreshnessAudit(asset.id, quoteKind, resolvedBaseline, meta.marketDataAt, freshnessView);
  meta.isStale       = freshnessView.isStale;
  meta.freshnessView = freshnessView;
  meta.quoteKind     = quoteKind;

  return {
    id: asset.id,
    name: asset.name,
    assetClass: asset.type === 'stock' ? 'stock' : 'fund',
    unitLabel: asset.unitLabel,
    displayPrice,
    priceMeta: meta,
    quantity: asset.quantity,
    averageCost: asset.averageCost,
    marketValue: asset.marketValue,
    unrealizedPnL: asset.unrealizedPnL,
    decisionKey,
    decisionLabel,
    decisionColor: style.color,
    decisionIcon: style.icon,
    environmentLabel: ENVIRONMENT_LABEL_MAP[marketResult.label as keyof typeof ENVIRONMENT_LABEL_MAP],
    environmentScore: marketResult.score,
    decisionBandText: watchZone ? MESSAGES.decisionBand(watchZone.watchLower, watchZone.watchUpper) : undefined,
    reasonText: decisionResult?.reasons[decisionResult.reasons.length - 1],
    basePriceText: primaryRule ? `${primaryRule.direction === 'sell' ? '売' : '買'} ${primaryRule.thresholdValue.toLocaleString()}円` : undefined,
    diffText,
    diffColor
  };
}
