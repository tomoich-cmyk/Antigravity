import { loadState, saveState } from './storage';
import type { SummaryNotification } from '../types';
import { calculateEntryScore } from './entryScore';

export async function generateSummary(
  type: 'midday' | 'close' | 'night'
): Promise<SummaryNotification> {
  const state = await loadState();
  const context = state.marketContext;
  
  const includedAssets: string[] = [];
  const lines: string[] = [];
  
  let candidatesCount = 0;

  for (const asset of state.assets) {
    const rules = state.triggerRules.filter(r => r.assetId === asset.id && r.isEnabled && !r.isCompleted);
    const ps = state.priceState?.[asset.id];
    const score = calculateEntryScore(asset, rules, context, ps);
    
    if (score.flag === 'in_candidate') {
      candidatesCount++;
      includedAssets.push(asset.id);
      
      const buyRules = rules.filter(r => r.direction === 'buy').sort((a,b) => b.thresholdValue - a.thresholdValue);
      const nextBuy = buyRules[0]?.thresholdValue || 0;
      const price = ps?.displayPrice || asset.currentPrice;
      const diff = Math.max(0, price - nextBuy);
      
      lines.push(`- ${asset.name}: 次買付ラインまであと ${diff.toLocaleString()}円`);
    } else {
      // For funds, show tailwind explicitly
      if (asset.type === 'fund' && score.reasons.some(r => r.includes('追い風'))) {
        candidatesCount++;
        includedAssets.push(asset.id);
        lines.push(`- ${asset.name}: 参考価格ベースで追い風`);
      }
    }
    
    // Check sell
    const sellRules = rules.filter(r => r.direction === 'sell').sort((a,b) => a.thresholdValue - b.thresholdValue);
    if (sellRules.length > 0) {
       const nextSell = sellRules[0].thresholdValue;
       const price = ps?.displayPrice || asset.currentPrice;
       if (price >= nextSell) {
           if (!includedAssets.includes(asset.id)) includedAssets.push(asset.id);
           lines.push(`- ${asset.name}: 売却候補帯到達 (${price.toLocaleString()} >= ${nextSell.toLocaleString()})`);
       } else if (nextSell - price <= 200) {
           // Close to sell
           if (!includedAssets.includes(asset.id)) includedAssets.push(asset.id);
           lines.push(`- ${asset.name}: 売却候補帯まであと ${(nextSell - price).toLocaleString()}円`);
       }
    }
  }

  const subjectMap = {
    'midday': '前場サマリ',
    'close': '大引けサマリ',
    'night': '夜の投信整理サマリ'
  };

  const subject = `Antigravity｜${subjectMap[type]}`;
  let body = lines.join('\n');
  if (lines.length === 0) {
    body = '本日の候補や目立った接近はありません。';
  } else {
    body += `\n\n本日の候補件数: ${candidatesCount}件`;
  }

  const notif: SummaryNotification = {
    id: crypto.randomUUID(),
    type,
    generatedAt: Date.now(),
    subject,
    body,
    assetsIncluded: [...new Set(includedAssets)],
    sent: false,
    channel: 'gmail'
  };

  // Save to state
  state.summaryNotifications = state.summaryNotifications || [];
  state.summaryNotifications.push(notif);
  await saveState(state);

  // Dispatch chrome notification to let user know summary is ready
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(subject, {
          body: `要約が生成されました。\n${lines.length > 0 ? lines[0] : ''}`,
          icon: '/favicon.svg'
      });
  }

  return notif;
}
