/**
 * fetchStatusStore.ts
 *
 * SnapshotFetchState の読み書き。
 * AppState とは別に localStorage に軽く保持する。
 * 価格データとは分離することで、price 書き換えゼロの失敗縮退を保証する。
 */

import type { SnapshotFetchState } from '../types/fetchStatus';

const KEY = 'antigravity_fetch_status';

const DEFAULT_STATE: SnapshotFetchState = {
  status: 'idle',
  fallbackUsed: false,
};

export function loadFetchStatus(): SnapshotFetchState {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return { ...DEFAULT_STATE };
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_STATE };
    return JSON.parse(raw) as SnapshotFetchState;
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveFetchStatus(state: SnapshotFetchState): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // localStorage が使えない環境では何もしない
  }
}
