import { loadState, saveState } from './storage';
import type { MarketContext } from '../types';
import { getSnapshotUrl } from './snapshotFetcher';

export async function getMarketContext(): Promise<MarketContext | undefined> {
  const state = await loadState();
  return state.marketContext;
}

export async function saveMarketContext(context: Partial<MarketContext>) {
  const state = await loadState();
  state.marketContext = { 
    ...state.marketContext, 
    ...context,
    lastContextUpdatedAt: Date.now()
  };
  await saveState(state);
}

import type { MarketSnapshot } from '../types/snapshot';

/** サーバーから最新の市況情報を取得する。Snapshot 全体を返す。 */
export async function fetchRemoteMarketSnapshot(): Promise<MarketSnapshot | undefined> {
  const endpoint = getSnapshotUrl();
  
  try {
    const res = await fetch(endpoint, {
      signal: AbortSignal.timeout(8000)
    });
    if (res.ok) {
      const json = await res.json() as MarketSnapshot;
      return json;
    } else {
      console.warn(`Market snapshot fetch failed with status: ${res.status}`);
      throw new Error(`Server returned ${res.status}`);
    }
  } catch (e) {
    console.error('Market snapshot fetch failed', e);
    // ネットワークエラー / 接続拒否 / タイムアウトを検知
    if (e instanceof Error && (e.name === 'AbortError' || e.message.includes('fetch'))) {
      throw new Error('サーバーに接続できません。サーバーが起動しているか確認してください。');
    }
    throw e;
  }
}

/** 
 * レガシー互換用：MarketContext の一部として取得する。
 * 新規コードでは fetchRemoteMarketSnapshot を推奨。
 */
export async function fetchRemoteMarketContext(): Promise<Partial<MarketContext>> {
  const snapshot = await fetchRemoteMarketSnapshot();
  if (!snapshot) return {};

  const ctx = snapshot.context;
  const result: Partial<MarketContext> = {};
  const isValidNum = (v: any) => typeof v === 'number' && !isNaN(v);

  if (isValidNum(ctx.usdJpy?.price)) result.usdJpy = ctx.usdJpy!.price;
  if (isValidNum(ctx.usdJpy?.changePct)) result.usdJpyDeltaPct = ctx.usdJpy!.changePct;
  if (isValidNum(ctx.usProxy?.changePct)) result.usIndexDeltaPct = ctx.usProxy!.changePct;
  if (isValidNum(ctx.worldProxy?.changePct)) result.worldIndexDeltaPct = ctx.worldProxy!.changePct;
  
  return result;
}

export function deriveTailwindFlagForFund(
  assetId: string, 
  context?: MarketContext
): 'tailwind' | 'neutral' | 'headwind' {
  if (!context) return 'neutral';
  
  // Manual override takes precedence
  if (context.manualContextLabel) {
    return context.manualContextLabel;
  }
  
  // Basic heuristic if we have index/fx data
  let score = 0;
  if (context.usdJpyDeltaPct && context.usdJpyDeltaPct > 0) score += 1;
  else if (context.usdJpyDeltaPct && context.usdJpyDeltaPct < 0) score -= 1;
  
  if (assetId === 'asset-ab') {
    if (context.usIndexDeltaPct && context.usIndexDeltaPct > 0) score += 1;
    else if (context.usIndexDeltaPct && context.usIndexDeltaPct < 0) score -= 1;
  } else if (assetId === 'asset-invesco') {
    if (context.worldIndexDeltaPct && context.worldIndexDeltaPct > 0) score += 1;
    else if (context.worldIndexDeltaPct && context.worldIndexDeltaPct < 0) score -= 1;
  }

  if (score > 0) return 'tailwind';
  if (score < 0) return 'headwind';
  return 'neutral';
}
