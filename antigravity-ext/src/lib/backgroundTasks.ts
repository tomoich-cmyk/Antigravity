import { loadState, saveState } from './storage';
import { evaluateTriggers } from './trigger';
import { dispatchNotifications } from './notifications';
import { generateSummary } from './summary';
import { applyQuoteSnapshots } from './price';
import { saveMarketContext } from './marketContext';
import { fetchMarketSnapshot, extractContextFromSnapshot } from './snapshotFetcher';
import { snapshotToQuoteSnapshots, isSnapshotStale } from './snapshotAdapter';
import { loadFetchStatus, saveFetchStatus } from './fetchStatusStore';
import { logFetchAudit } from './freshnessAudit';
import type { FetchErrorKind } from '../types/fetchStatus';

// ─── エラー分類 ───────────────────────────────────────────────────────────────

function classifyFetchError(err: unknown): FetchErrorKind {
  if (!(err instanceof Error)) return 'network';
  if (err.name === 'AbortError' || err.message.toLowerCase().includes('timeout')) return 'timeout';
  if (err.message.toLowerCase().includes('json') || err.message.toLowerCase().includes('parse')) return 'invalid_payload';
  if (err.message.toLowerCase().includes('adapter')) return 'adapter_error';
  return 'network';
}

function toSafeMessage(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 200);
  return String(err).slice(0, 200);
}

// ─── applySnapshot ────────────────────────────────────────────────────────────

/**
 * スナップショットを取得して AppState に反映する。
 * 失敗しても既存の quote は上書きせず fetchStatus だけ更新する。
 */
async function applySnapshot(): Promise<void> {
  const now = new Date().toISOString();
  const prevStatus = loadFetchStatus();

  // ── 取得試行 ──
  let snapshot;
  try {
    snapshot = await fetchMarketSnapshot();
  } catch (err) {
    // fetchMarketSnapshot は内部で catch → null を返す設計だが念のため
    const errorKind = classifyFetchError(err);
    saveFetchStatus({
      status: 'failed',
      lastAttemptAt: now,
      lastErrorAt: now,
      lastSuccessAt: prevStatus.lastSuccessAt,
      errorKind,
      errorMessage: toSafeMessage(err),
      fallbackUsed: true,
    });
    logFetchAudit({ status: 'failed', errorKind, fallbackUsed: true, lastSuccessAt: prevStatus.lastSuccessAt });
    return;
  }

  // fetchMarketSnapshot は失敗時 null を返す
  if (!snapshot) {
    saveFetchStatus({
      status: 'failed',
      lastAttemptAt: now,
      lastErrorAt: now,
      lastSuccessAt: prevStatus.lastSuccessAt,
      errorKind: 'network',
      errorMessage: 'fetchMarketSnapshot returned null',
      fallbackUsed: true,
    });
    logFetchAudit({ status: 'failed', errorKind: 'network', fallbackUsed: true, lastSuccessAt: prevStatus.lastSuccessAt });
    return;
  }

  if (isSnapshotStale(snapshot)) {
    console.warn('[snapshot] server returned stale snapshot — applying anyway');
  }

  // ── adapter 変換 ──
  let quotes;
  try {
    quotes = snapshotToQuoteSnapshots(snapshot, new Date());
  } catch (err) {
    saveFetchStatus({
      status: 'failed',
      lastAttemptAt: now,
      lastErrorAt: now,
      lastSuccessAt: prevStatus.lastSuccessAt,
      errorKind: 'adapter_error',
      errorMessage: toSafeMessage(err),
      fallbackUsed: true,
    });
    logFetchAudit({ status: 'failed', errorKind: 'adapter_error', fallbackUsed: true, lastSuccessAt: prevStatus.lastSuccessAt });
    return;
  }

  // ── 空スナップショット ──
  if (quotes.length === 0) {
    saveFetchStatus({
      status: 'failed',
      lastAttemptAt: now,
      lastErrorAt: now,
      lastSuccessAt: prevStatus.lastSuccessAt,
      errorKind: 'empty_snapshot',
      errorMessage: 'no valid quotes in snapshot',
      fallbackUsed: true,
    });
    logFetchAudit({ status: 'failed', errorKind: 'empty_snapshot', fallbackUsed: true, lastSuccessAt: prevStatus.lastSuccessAt });
    return;
  }

  // ── 成功: price 更新 ──
  await applyQuoteSnapshots(quotes);
  console.log(`[snapshot] applied ${quotes.length} quote(s) from ${snapshot.fetchedAt}`);

  saveFetchStatus({
    status: 'success',
    lastAttemptAt: now,
    lastSuccessAt: now,
    fallbackUsed: false,
  });
  logFetchAudit({ status: 'success', quotesApplied: quotes.length, fallbackUsed: false });

  // ── 市況コンテキスト ──
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
