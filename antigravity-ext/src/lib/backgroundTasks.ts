import { loadState, saveState } from './storage';
import { evaluateTriggers } from './trigger';
import { dispatchNotifications } from './notifications';
import { generateSummary } from './summary';
import { applyQuoteSnapshots } from './price';
import { saveMarketContext } from './marketContext';
import { fetchMarketSnapshot, extractContextFromSnapshot } from './snapshotFetcher';
import { snapshotToQuoteSnapshots, isSnapshotStale } from './snapshotAdapter';

/**
 * スナップショットを取得して AppState に反映する。
 * - 株価: snapshotAdapter → QuoteSnapshot[] → applyQuoteSnapshots()
 * - 市況: extractContextFromSnapshot → saveMarketContext()
 * 失敗しても例外を投げない（手動更新にフォールバック）
 */
async function applySnapshot(): Promise<void> {
  const snapshot = await fetchMarketSnapshot();
  if (!snapshot) return;

  if (isSnapshotStale(snapshot)) {
    console.warn('[snapshot] server returned stale snapshot — applying anyway');
  }

  // 株価を QuoteSnapshot 形式で反映
  const quotes = snapshotToQuoteSnapshots(snapshot, new Date());
  if (quotes.length > 0) {
    await applyQuoteSnapshots(quotes);
    console.log(`[snapshot] applied ${quotes.length} quote(s) from ${snapshot.fetchedAt}`);
  }

  // 市況コンテキストを反映
  const ctx = extractContextFromSnapshot(snapshot);
  if (ctx.usdJpyDeltaPct !== undefined || ctx.usIndexDeltaPct !== undefined) {
    await saveMarketContext(ctx);
  }
}

export async function runBackgroundTasks() {
  // 1. スナップショット取得 & 反映 (失敗しても続行)
  try {
    await applySnapshot();
  } catch (err) {
    console.warn('[backgroundTasks] snapshot apply failed:', err);
  }

  const state = await loadState();

  // 2. Trigger evaluation
  const { updatedRules, newNotifications } = evaluateTriggers(
    state.assets || [],
    state.triggerRules || [],
    state.lastEvaluatedAt || 0,
    state.priceState,
    state.useReferencePriceForTrigger
  );

  state.lastEvaluatedAt = Date.now();

  if (newNotifications.length > 0) {
    state.triggerRules = updatedRules;
    await saveState(state);
    await dispatchNotifications(newNotifications);
  } else {
    state.triggerRules = updatedRules;
    await saveState(state);
  }

  // 3. Summary generation
  const d = new Date();
  const h = d.getHours();
  const m = d.getMinutes();
  const todayStr = d.toISOString().split('T')[0];

  const hasGeneratedToday = (type: string) => {
    return (state.summaryNotifications || []).some(
      (n) => n.type === type && new Date(n.generatedAt).toISOString().startsWith(todayStr)
    );
  };

  if (h === 11 && m >= 40 && !hasGeneratedToday('midday')) {
    await generateSummary('midday');
  }
  if (h === 15 && m >= 10 && !hasGeneratedToday('close')) {
    await generateSummary('close');
  }
  if (h === 21 && m >= 0 && !hasGeneratedToday('night')) {
    await generateSummary('night');
  }
}

let taskInterval: number | null = null;

export function startBackgroundTasks() {
  runBackgroundTasks().catch(console.error);

  if (!taskInterval) {
    taskInterval = window.setInterval(() => {
      runBackgroundTasks().catch(console.error);
    }, 10 * 60 * 1000);
  }
}

export function stopBackgroundTasks() {
  if (taskInterval) {
    window.clearInterval(taskInterval);
    taskInterval = null;
  }
}

