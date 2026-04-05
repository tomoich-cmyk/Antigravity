import type { MarketSnapshot } from '../types/snapshot';

const CACHE_KEY = 'antigravity_last_snapshot';
const SNAPSHOT_URL_KEY = 'antigravity_snapshot_url';

/** デフォルトの snapshot サーバー URL */
const DEFAULT_SNAPSHOT_URL = 'http://127.0.0.1:3001/market-snapshot';

/** URL を localStorage から取得（設定画面で変更可能） */
export function getSnapshotUrl(): string {
  return localStorage.getItem(SNAPSHOT_URL_KEY) ?? DEFAULT_SNAPSHOT_URL;
}

/** URL を localStorage に保存 */
export function setSnapshotUrl(url: string): void {
  localStorage.setItem(SNAPSHOT_URL_KEY, url);
}

/**
 * サーバーから MarketSnapshot を取得する
 * - 失敗時は null を返す（画面を崩さない）
 * - 成功時は localStorage にキャッシュ
 */
export async function fetchMarketSnapshot(url?: string): Promise<MarketSnapshot | null> {
  const endpoint = url ?? getSnapshotUrl();
  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000), // 8秒タイムアウト
    });

    if (!res.ok) {
      console.warn(`[snapshot] server returned ${res.status}`);
      return null;
    }

    const data = (await res.json()) as MarketSnapshot;
    // エラーレスポンスが来た場合は null 扱い
    if ('error' in data) {
      console.warn('[snapshot] server returned error:', (data as { error: string }).error);
      return null;
    }

    // キャッシュ更新
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    return data;
  } catch (err) {
    // ネットワークエラー / タイムアウト / CORS → null
    if (err instanceof Error && err.name !== 'AbortError') {
      console.warn('[snapshot] fetch failed:', err.message);
    }
    return null;
  }
}

/** キャッシュされた最新スナップショットを取得 */
export function getCachedSnapshot(): MarketSnapshot | null {
  try {
    const item = localStorage.getItem(CACHE_KEY);
    if (!item) return null;
    return JSON.parse(item) as MarketSnapshot;
  } catch {
    return null;
  }
}

/**
 * スナップショットを AppState に反映するための価格マッピング
 * assetId → snapshot の価格を返す
 */
export function extractPricesFromSnapshot(
  snapshot: MarketSnapshot
): Array<{ assetId: string; price: number; source: 'batch'; marketDataAt?: string; baselineDate?: string; priceKind?: 'market' | 'close' | 'official' | 'reference' }> {
  const updates: Array<{ assetId: string; price: number; source: 'batch'; marketDataAt?: string; baselineDate?: string; priceKind?: 'market' | 'close' | 'official' | 'reference' }> = [];

  if (snapshot.stocks.gmopg?.price) {
    updates.push({
      assetId: 'asset-gmopg',
      price: snapshot.stocks.gmopg.price,
      source: 'batch',
      marketDataAt: snapshot.stocks.gmopg.marketDataAt,
      priceKind: snapshot.stocks.gmopg.priceKind as 'market' | 'close' | 'official' | 'reference' | undefined,
    });
  }
  if (snapshot.stocks.unext?.price) {
    updates.push({
      assetId: 'asset-unext',
      price: snapshot.stocks.unext.price,
      source: 'batch',
      marketDataAt: snapshot.stocks.unext.marketDataAt,
      priceKind: snapshot.stocks.unext.priceKind as 'market' | 'close' | 'official' | 'reference' | undefined,
    });
  }

  return updates;
}

/**
 * スナップショットから MarketContext 用データを抽出
 */
export function extractContextFromSnapshot(
  snapshot: MarketSnapshot
): {
  usdJpyDeltaPct?: number;
  usIndexDeltaPct?: number;
  worldIndexDeltaPct?: number;
  usIndexName?: string;
} {
  return {
    usdJpyDeltaPct: snapshot.context.usdJpy?.changePct,
    usIndexDeltaPct: snapshot.context.usProxy?.changePct,
    worldIndexDeltaPct: snapshot.context.worldProxy?.changePct,
    usIndexName: snapshot.context.usProxy?.symbol,
  };
}
