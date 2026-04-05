import { loadState, saveState } from './storage';
import { evaluateTriggers } from './trigger';
import { dispatchNotifications } from './notifications';
import { generateSummary } from './summary';
import { updateAssetPricesAndEvaluate } from './price';
import { saveMarketContext } from './marketContext';
import {
  fetchMarketSnapshot,
  extractPricesFromSnapshot,
  extractContextFromSnapshot,
} from './snapshotFetcher';

/**
 * スナップショットを取得して AppState に反映する
 * 失敗しても例外を投げない（手動更新にフォールバック）
 */
async function applySnapshot(): Promise<void> {
  const snapshot = await fetchMarketSnapshot();
  if (!snapshot) return; // 取得失敗 → 何もしない

  // 株価を反映
  const priceUpdates = extractPricesFromSnapshot(snapshot);
  if (priceUpdates.length > 0) {
    await updateAssetPricesAndEvaluate(priceUpdates);
    console.log(
      `[snapshot] applied ${priceUpdates.length} price(s) from ${snapshot.fetchedAt}`
    );
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

