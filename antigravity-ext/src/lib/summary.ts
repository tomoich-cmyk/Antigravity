import { loadState, saveState } from './storage';
import type { Asset, SummaryNotification, TriggerRule, AssetPriceState, MarketContext } from '../types';
import { calculateEntryScore } from './entryScore';
import { generateSummaryText, type CandidateBlockReason } from './summaryText';
import { loadFetchStatus } from './fetchStatusStore';
import { deriveBaselineDate } from './baselineDate';
import type { QuoteKind, AssetClass, QuoteSnapshot } from '../types/market';

// ─── Asset → QuoteSnapshot 変換 ───────────────────────────────────────────────

function assetToQuoteSnapshot(
  asset: Asset,
  ps: AssetPriceState | undefined,
  now: Date,
): QuoteSnapshot {
  const price = ps?.displayPrice ?? ps?.price ?? asset.currentPrice;
  const pk = ps?.priceKind as string | undefined;
  let quoteKind: QuoteKind;
  if (pk === 'official') quoteKind = 'nav';
  else if (pk === 'reference') quoteKind = 'reference';
  else if (pk === 'close') quoteKind = 'close';
  else quoteKind = 'intraday';

  const assetClass: AssetClass = asset.type === 'fund' ? 'mutual_fund' : 'jp_stock';
  const syncedAt = ps?.lastApiSyncedAt
    ? new Date(ps.lastApiSyncedAt).toISOString()
    : now.toISOString();
  const resolvedBaseline = ps?.baselineDate ?? deriveBaselineDate({
    assetClass, quoteKind, marketDataAt: ps?.marketDataAt, now,
  });

  return {
    assetId: asset.name,   // 表示名として使う
    assetClass,
    value: price,
    currency: 'JPY',
    quoteKind,
    source: { id: 'manual', mode: 'manual', label: '' },
    syncedAt,
    marketDataAt: ps?.marketDataAt ?? null,
    baselineDate: resolvedBaseline,
  };
}

// ─── 買付候補・売却接近の評価 ──────────────────────────────────────────────────

function buildCandidateLines(
  assets: Asset[],
  triggerRules: TriggerRule[],
  priceState: Record<string, AssetPriceState> | undefined,
  context: MarketContext | undefined,
  filterFn?: (asset: Asset) => boolean
): { lines: string[]; includedAssets: string[]; candidatesCount: number } {
  const lines: string[] = [];
  const includedAssets: string[] = [];
  let candidatesCount = 0;

  for (const asset of assets) {
    if (filterFn && !filterFn(asset)) continue;

    const rules = triggerRules.filter(r => r.assetId === asset.id && r.isEnabled && !r.isCompleted);
    const ps = priceState?.[asset.id];
    const score = calculateEntryScore(asset, rules, context, ps);
    const price = ps?.displayPrice || asset.currentPrice;

    if (score.flag === 'in_candidate') {
      candidatesCount++;
      includedAssets.push(asset.id);
      const buyRules = rules.filter(r => r.direction === 'buy').sort((a, b) => b.thresholdValue - a.thresholdValue);
      const nextBuy = buyRules[0]?.thresholdValue || 0;
      const diff = Math.max(0, price - nextBuy);
      lines.push(`- ${asset.name}: 次買付ラインまであと ${diff.toLocaleString()}円`);
    } else {
      if (asset.type === 'fund' && score.reasons.some(r => r.includes('追い風'))) {
        candidatesCount++;
        includedAssets.push(asset.id);
        lines.push(`- ${asset.name}: 参考価格ベースで追い風`);
      }
    }

    const sellRules = rules.filter(r => r.direction === 'sell').sort((a, b) => a.thresholdValue - b.thresholdValue);
    if (sellRules.length > 0) {
      const nextSell = sellRules[0].thresholdValue;
      if (price >= nextSell) {
        if (!includedAssets.includes(asset.id)) includedAssets.push(asset.id);
        candidatesCount++;
        lines.push(`- ${asset.name}: 売却候補帯到達 (>= ${nextSell.toLocaleString()}円)`);
      } else if (nextSell - price <= 200) {
        if (!includedAssets.includes(asset.id)) includedAssets.push(asset.id);
        candidatesCount++;
        lines.push(`- ${asset.name}: 売却候補帯まであと ${(nextSell - price).toLocaleString()}円`);
      }
    }
  }

  return { lines, includedAssets, candidatesCount };
}

// ─── generateSummary ─────────────────────────────────────────────────────────

export async function generateSummary(
  type: 'midday' | 'close' | 'night'
): Promise<SummaryNotification> {
  const state = await loadState();
  const context = state.marketContext;
  const now = new Date();
  const fetchStatus = loadFetchStatus();

  const subjectMap = {
    midday: '前場サマリ',
    close: '大引けサマリ',
    night: '夜の投信整理サマリ',
  };
  const subject = `Antigravity｜${subjectMap[type]}`;

  // 【価格】セクション: 全資産の鮮度付き価格 (generateSummaryText 経由)
  const allQuotes = state.assets.map(a =>
    assetToQuoteSnapshot(a, state.priceState?.[a.id], now)
  );

  let body = '';
  const allIncluded: string[] = [];

  // ── 前場サマリ / 大引けサマリ ──
  if (type === 'midday' || type === 'close') {
    const { lines, includedAssets, candidatesCount } = buildCandidateLines(
      state.assets, state.triggerRules, state.priceState, context
    );
    allIncluded.push(...includedAssets);

    // 候補ブロック理由
    let candidateBlockReason: CandidateBlockReason | undefined;
    if (!context) candidateBlockReason = 'market_context_missing';
    else if (lines.length === 0) candidateBlockReason = 'score_below_threshold';

    // 価格サマリーセクション
    const priceSection = generateSummaryText({ quotes: allQuotes, now: now.toISOString(), fetchStatus });

    // 候補セクション
    let candidateSection = '';
    if (lines.length > 0) {
      candidateSection = lines.join('\n') + `\n候補件数: ${candidatesCount}件`;
    } else if (candidateBlockReason) {
      candidateSection = buildCandidateReasonTextLocal(candidateBlockReason);
    }

    const parts = [`【価格】\n${priceSection}`];
    if (candidateSection) parts.push(`【候補】\n${candidateSection}`);

    // 大引け追加: 翌営業日向け注記
    if (type === 'close') {
      const plannedCount = state.transactions.filter(t => t.status === 'planned' && !t.isDeleted).length;
      if (plannedCount > 0) {
        parts.push(`【翌営業日】注文予定: ${plannedCount}件 → 確定忘れを確認してください`);
      }
    }

    body = parts.join('\n\n');
  }

  // ── 夜サマリ: 投信フォーカス + 含み損益 ──
  if (type === 'night') {
    const nightParts: string[] = [];

    // 投信のみの価格サマリー
    const fundQuotes = allQuotes.filter((_, i) => state.assets[i].type === 'fund');
    if (fundQuotes.length > 0) {
      const fundPriceSection = generateSummaryText({ quotes: fundQuotes, now: now.toISOString(), fetchStatus });
      nightParts.push(`【投信 価格】\n${fundPriceSection}`);
    }

    // 投信の候補・接近
    const { lines: fundLines, includedAssets: fundAssets } = buildCandidateLines(
      state.assets, state.triggerRules, state.priceState, context,
      (a) => a.type === 'fund'
    );
    allIncluded.push(...fundAssets);
    if (fundLines.length > 0) {
      nightParts.push(`【投信 候補・接近】\n${fundLines.join('\n')}`);
    }

    // 投信の含み損益
    const fundAssetsSummary = state.assets.filter(a => a.type === 'fund');
    if (fundAssetsSummary.length > 0) {
      const pnlLines = fundAssetsSummary.map(a => {
        const sign = a.unrealizedPnL >= 0 ? '+' : '';
        return `- ${a.name}: ${sign}${a.unrealizedPnL.toLocaleString()}円`;
      });
      nightParts.push(`【投信 含み損益】\n${pnlLines.join('\n')}`);
    }

    // 翌日の注目点（株式接近）
    const { lines: stockLines, includedAssets: stockAssets } = buildCandidateLines(
      state.assets, state.triggerRules, state.priceState, context,
      (a) => a.type === 'stock'
    );
    allIncluded.push(...stockAssets);
    if (stockLines.length > 0) {
      nightParts.push(`【翌日注目 株式】\n${stockLines.join('\n')}`);
    }

    body = nightParts.join('\n\n');
  }

  const notif: SummaryNotification = {
    id: crypto.randomUUID(),
    type,
    generatedAt: Date.now(),
    subject,
    body,
    assetsIncluded: [...new Set(allIncluded)],
    sent: false,
    channel: 'gmail',
  };

  state.summaryNotifications = state.summaryNotifications || [];
  state.summaryNotifications.push(notif);
  await saveState(state);

  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    new Notification(subject, {
      body: `要約が生成されました。`,
      icon: '/favicon.svg',
    });
  }

  return notif;
}

// ローカル再エクスポート (import コスト削減)
function buildCandidateReasonTextLocal(reason: CandidateBlockReason): string {
  if (reason === 'market_context_missing') return '市場コンテキスト未同期のため、買付候補は保守的に非表示です。';
  if (reason === 'stale_market_data') return '価格鮮度が低いため、候補評価をスキップしました。';
  return '閾値未達のため候補なし。';
}
