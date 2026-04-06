import { loadState, saveState } from './storage';
import type { Asset, SummaryNotification, TriggerRule, AssetPriceState, MarketContext } from '../types';
import { calculateEntryScore } from './entryScore';
import { evaluateFreshness } from './freshness';
import { deriveBaselineDate } from './baselineDate';
import type { QuoteKind, AssetClass } from '../types/market';

/** 価格とその鮮度ラベルを "現在値 9,850" / "4/5 終値 4,210" 形式で返す */
function buildPriceLabel(asset: Asset, ps: AssetPriceState | undefined): string {
  if (!ps) return '';
  const price = ps.displayPrice ?? ps.price;

  // priceKind → quoteKind
  const pk = ps.priceKind as string | undefined;
  let quoteKind: QuoteKind;
  if (pk === 'official') quoteKind = 'nav';
  else if (pk === 'reference') quoteKind = 'reference';
  else if (pk === 'close') quoteKind = 'close';
  else quoteKind = 'intraday';

  const assetClass: AssetClass = asset.type === 'fund' ? 'mutual_fund' : 'jp_stock';
  const now = new Date();
  const syncedAt = ps.lastApiSyncedAt
    ? new Date(ps.lastApiSyncedAt).toISOString()
    : now.toISOString();
  const resolvedBaseline = ps.baselineDate ?? deriveBaselineDate({
    assetClass, quoteKind, marketDataAt: ps.marketDataAt, now,
  });

  const fv = evaluateFreshness({
    quote: {
      assetId: asset.id,
      assetClass,
      value: price,
      currency: 'JPY',
      quoteKind,
      source: { id: 'manual', mode: 'manual', label: '' },
      syncedAt,
      marketDataAt: ps.marketDataAt ?? null,
      baselineDate: resolvedBaseline,
    },
    now,
  });

  const labelPart = fv.canPretendCurrent ? fv.priceLabel : fv.asOfLabel;
  return `${labelPart} ${price.toLocaleString()}円`;
}

// ─── 共通: 買付候補・売却接近を全資産で評価 ───────────────────────────
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
    const priceLabel = buildPriceLabel(asset, ps);

    if (score.flag === 'in_candidate') {
      candidatesCount++;
      includedAssets.push(asset.id);
      const buyRules = rules.filter(r => r.direction === 'buy').sort((a, b) => b.thresholdValue - a.thresholdValue);
      const nextBuy = buyRules[0]?.thresholdValue || 0;
      const diff = Math.max(0, price - nextBuy);
      const labelStr = priceLabel ? ` [${priceLabel}]` : '';
      lines.push(`- ${asset.name}${labelStr}: 次買付ラインまであと ${diff.toLocaleString()}円`);
    } else {
      if (asset.type === 'fund' && score.reasons.some(r => r.includes('追い風'))) {
        candidatesCount++;
        includedAssets.push(asset.id);
        const labelStr = priceLabel ? ` [${priceLabel}]` : '';
        lines.push(`- ${asset.name}${labelStr}: 参考価格ベースで追い風`);
      }
    }

    const sellRules = rules.filter(r => r.direction === 'sell').sort((a, b) => a.thresholdValue - b.thresholdValue);
    if (sellRules.length > 0) {
      const nextSell = sellRules[0].thresholdValue;
      if (price >= nextSell) {
        if (!includedAssets.includes(asset.id)) includedAssets.push(asset.id);
        candidatesCount++;
        const labelStr = priceLabel ? ` [${priceLabel}]` : '';
        lines.push(`- ${asset.name}${labelStr}: 売却候補帯到達 (>= ${nextSell.toLocaleString()}円)`);
      } else if (nextSell - price <= 200) {
        if (!includedAssets.includes(asset.id)) includedAssets.push(asset.id);
        candidatesCount++;
        const labelStr = priceLabel ? ` [${priceLabel}]` : '';
        lines.push(`- ${asset.name}${labelStr}: 売却候補帯まであと ${(nextSell - price).toLocaleString()}円`);
      }
    }
  }

  return { lines, includedAssets, candidatesCount };
}

export async function generateSummary(
  type: 'midday' | 'close' | 'night'
): Promise<SummaryNotification> {
  const state = await loadState();
  const context = state.marketContext;

  const subjectMap = {
    midday: '前場サマリ',
    close: '大引けサマリ',
    night: '夜の投信整理サマリ',
  };
  const subject = `Antigravity｜${subjectMap[type]}`;

  let body = '';
  const allIncluded: string[] = [];

  // ── 前場サマリ: 全資産の買付候補・接近 ──
  if (type === 'midday') {
    const { lines, includedAssets, candidatesCount } = buildCandidateLines(
      state.assets, state.triggerRules, state.priceState, context
    );
    allIncluded.push(...includedAssets);
    if (lines.length === 0) {
      body = '前場時点で候補や目立った接近はありません。';
    } else {
      body = lines.join('\n') + `\n\n候補件数: ${candidatesCount}件`;
    }
  }

  // ── 大引けサマリ: 全資産 + 翌営業日向けメッセージ ──
  if (type === 'close') {
    const { lines, includedAssets, candidatesCount } = buildCandidateLines(
      state.assets, state.triggerRules, state.priceState, context
    );
    allIncluded.push(...includedAssets);
    const closingLines: string[] = [];
    if (lines.length > 0) {
      closingLines.push(...lines);
      closingLines.push(`\n候補件数: ${candidatesCount}件`);
    } else {
      closingLines.push('本日の候補や目立った接近はありません。');
    }
    // 翌営業日向けの注記
    const plannedCount = state.transactions.filter(t => t.status === 'planned' && !t.isDeleted).length;
    if (plannedCount > 0) {
      closingLines.push(`\n【翌営業日】注文予定: ${plannedCount}件 → 確定忘れを確認してください`);
    }
    body = closingLines.join('\n');
  }

  // ── 夜サマリ: 投信フォーカス + 含み損益整理 ──
  if (type === 'night') {
    const nightLines: string[] = [];

    // 投信のみの候補評価
    const { lines: fundLines, includedAssets: fundAssets } = buildCandidateLines(
      state.assets, state.triggerRules, state.priceState, context,
      (a) => a.type === 'fund'
    );
    allIncluded.push(...fundAssets);

    if (fundLines.length > 0) {
      nightLines.push('【投信 候補・接近】');
      nightLines.push(...fundLines);
    } else {
      nightLines.push('【投信】本日の候補や接近はありません。');
    }

    // 含み損益サマリ
    const fundAssetsSummary = state.assets.filter(a => a.type === 'fund');
    if (fundAssetsSummary.length > 0) {
      nightLines.push('\n【投信 含み損益】');
      for (const a of fundAssetsSummary) {
        const sign = a.unrealizedPnL >= 0 ? '+' : '';
        const ps = state.priceState?.[a.id];
        const priceLabel = buildPriceLabel(a, ps);
        const labelStr = priceLabel ? ` [${priceLabel}]` : '';
        nightLines.push(`- ${a.name}${labelStr}: ${sign}${a.unrealizedPnL.toLocaleString()}円`);
      }
    }

    // 翌日の注目点（株式で接近しているものがあれば）
    const { lines: stockLines, includedAssets: stockAssets } = buildCandidateLines(
      state.assets, state.triggerRules, state.priceState, context,
      (a) => a.type === 'stock'
    );
    allIncluded.push(...stockAssets);
    if (stockLines.length > 0) {
      nightLines.push('\n【翌日注目 株式】');
      nightLines.push(...stockLines);
    }

    body = nightLines.join('\n');
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

  // Save to state
  state.summaryNotifications = state.summaryNotifications || [];
  state.summaryNotifications.push(notif);
  await saveState(state);

  // Dispatch chrome notification
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    new Notification(subject, {
      body: `要約が生成されました。`,
      icon: '/favicon.svg',
    });
  }

  return notif;
}
