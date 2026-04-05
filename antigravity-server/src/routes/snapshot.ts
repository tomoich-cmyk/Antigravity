import { Hono } from 'hono';
import type { IMarketFetcher } from '../fetchers/types.js';
import type { MarketSnapshot } from '../types/snapshot.js';
import { MemoryCache } from '../lib/cache.js';

/** キャッシュ設定 — SNAPSHOT_CACHE_TTL_MS 環境変数で上書き可能 (デフォルト 5 分) */
export const CACHE_TTL_MS = parseInt(process.env.SNAPSHOT_CACHE_TTL_MS ?? String(5 * 60 * 1000), 10);
export const CACHE_KEY = 'snapshot:latest';

/**
 * Module-level cache shared across all requests and the scheduler.
 * Entries remain available as stale after TTL expires (for fallback serving).
 */
export const cache = new MemoryCache<MarketSnapshot>();

/** Returns cache stats for the /health endpoint */
export function snapshotCacheStats(): {
  cacheTtlMs: number;
  hasCachedEntry: boolean;
  cacheAgeMs: number | null;
  cacheStale: boolean;
} {
  const result = cache.get(CACHE_KEY);
  return {
    cacheTtlMs: CACHE_TTL_MS,
    hasCachedEntry: result !== null,
    cacheAgeMs: result?.ageMs ?? null,
    cacheStale: result?.stale ?? false,
  };
}

/**
 * GET /market-snapshot
 *
 * Flow:
 *  1. Cache hit (within TTL)   → return cached data with _meta.cacheHit = true
 *  2. Cache miss / stale       → fetch from upstream
 *  3. Upstream OK              → update cache, return fresh data
 *  4. Upstream FAIL + stale¹   → return stale data with _meta.stale = true, HTTP 200²
 *  5. Upstream FAIL + no cache → return error, HTTP 503
 *
 * ¹ Any cached entry, even if TTL expired, is used as fallback.
 * ² Serving stale as 200 prevents PWA from treating it as an error.
 */
export function createSnapshotRoute(fetcher: IMarketFetcher) {
  const route = new Hono();

  route.get('/', async (c) => {
    // --- 1. Cache hit ---
    const cached = cache.get(CACHE_KEY);
    if (cached && cached.hit) {
      const ageSec = Math.round(cached.ageMs / 1000);
      console.log(`[snapshot] cache HIT (age: ${ageSec}s, ttl: ${CACHE_TTL_MS / 1000}s)`);
      const response: MarketSnapshot = {
        ...cached.value,
        _meta: {
          ...(cached.value._meta ?? { fetcher: fetcher.name }),
          cacheHit: true,
          stale: false,
        },
      };
      return c.json(response);
    }

    // --- 2. Cache miss or stale → fetch upstream ---
    const staleCached = cached; // may be stale, used as fallback below
    console.log(
      staleCached
        ? `[snapshot] cache MISS (stale, age: ${Math.round(staleCached.ageMs / 1000)}s) — fetching fresh`
        : '[snapshot] cache MISS (empty) — fetching fresh'
    );

    try {
      const snapshot = await fetcher.fetch();

      // --- 3. Upstream OK — update cache ---
      cache.set(CACHE_KEY, snapshot, CACHE_TTL_MS);
      console.log(`[snapshot] cached fresh snapshot (ttl: ${CACHE_TTL_MS / 1000}s)`);

      return c.json(snapshot);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      console.error(`[snapshot] upstream FAILED (${fetcher.name}): ${msg}`);

      // --- 4. Stale fallback ---
      if (staleCached) {
        const ageSec = Math.round(staleCached.ageMs / 1000);
        console.warn(`[snapshot] serving STALE cache (age: ${ageSec}s) as fallback`);
        const response: MarketSnapshot = {
          ...staleCached.value,
          _meta: {
            ...(staleCached.value._meta ?? { fetcher: fetcher.name }),
            cacheHit: false,
            stale: true,
            errors: {
              ...(staleCached.value._meta?.errors ?? {}),
              '_upstream': msg,
            },
          },
        };
        return c.json(response); // 200 so PWA doesn't panic
      }

      // --- 5. No cache at all → 503 ---
      return c.json(
        {
          error: 'snapshot_fetch_failed',
          fetcher: fetcher.name,
          message: msg,
        },
        503
      );
    }
  });

  return route;
}
