import type { AppState } from '../types';
import { initialData } from './initialData';
import { migrateState } from './migrations';

const STORAGE_KEY = 'antigravity_state';

let mockStorage: AppState | null = null;

export async function loadState(): Promise<AppState> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const item = localStorage.getItem(STORAGE_KEY);
        if (item) {
          const parsed = JSON.parse(item) as AppState;
          const migrated = migrateState(parsed);
          // 移行が発生した場合（version が上がった）は保存
          if (migrated.version !== parsed.version) {
            saveState(migrated);
          }
          resolve(migrated);
        } else {
          const initialized = migrateState(JSON.parse(JSON.stringify(initialData)));
          saveState(initialized);
          resolve(initialized);
        }
      } catch (e) {
        console.error('データの読み込みに失敗しました:', e);
        resolve(initialData);
      }
    } else {
      if (mockStorage) {
        resolve(mockStorage);
      } else {
        mockStorage = migrateState(JSON.parse(JSON.stringify(initialData)));
        resolve(mockStorage!);
      }
    }
  });
}

export async function saveState(state: AppState): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        window.dispatchEvent(new CustomEvent('antigravity_storage_update', { detail: state }));
        resolve();
      } catch (e) {
        console.error('データの保存に失敗しました:', e);
        resolve();
      }
    } else {
      mockStorage = JSON.parse(JSON.stringify(state));
      resolve();
    }
  });
}

export function onStateChanged(callback: (state: AppState) => void) {
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        callback(JSON.parse(e.newValue) as AppState);
      }
    });
    window.addEventListener('antigravity_storage_update', (e: Event) => {
      callback((e as CustomEvent<AppState>).detail);
    });
  }
}
