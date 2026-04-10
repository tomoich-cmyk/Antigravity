import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createSnapshotRoute, snapshotCacheStats, cache as snapshotCache, CACHE_TTL_MS } from './routes/snapshot.js';
import { marketRoute } from './routes/market.js';
import { MockFetcher } from './fetchers/mock.js';
import { JQuantsFetcher } from './fetchers/jquants.js';
import type { IMarketFetcher } from './fetchers/types.js';
import { tokenStatus } from './lib/tokenStore.js';
import { startScheduler } from './lib/scheduler.js';

/**
 * Hono アプリの組み立て
 *
 * Cloud runtime (Cloudflare Workers, Vercel 等) へのデプロイ時は
 * `export default app` として再エクスポートするだけで動作する。
 */

// ---------------------------------------------------------------------------
// Fetcher の選択
// ---------------------------------------------------------------------------
// FETCHER=mock    → MockFetcher  (デフォルト、安全)
// FETCHER=jquants → JQuantsFetcher
//   認証方法 A: JQUANTS_EMAIL + JQUANTS_PASSWORD (通常アカウント)
//   認証方法 B: JQUANTS_REFRESH_TOKEN (Google アカウント等、パスワード不使用)
//   どちらも未設定の場合は Mock にフォールバック
// ---------------------------------------------------------------------------

function buildFetcher(): IMarketFetcher {
  const mode = process.env.FETCHER ?? 'mock';

  if (mode === 'jquants') {
    const hasCredentials =
      (process.env.JQUANTS_EMAIL && process.env.JQUANTS_PASSWORD) ||
      process.env.JQUANTS_REFRESH_TOKEN ||
      process.env.JQUANTS_API_KEY;

    if (!hasCredentials) {
      console.warn(
        '[antigravity-server] FETCHER=jquants が指定されましたが、認証情報が未設定です。\n' +
        '  方法A: JQUANTS_EMAIL + JQUANTS_PASSWORD\n' +
        '  方法B: JQUANTS_REFRESH_TOKEN (Google アカウント)\n' +
        '  方法C: JQUANTS_API_KEY (ダッシュボードの API Keys ページ)\n' +
        'Mock にフォールバックします。'
      );
      return new MockFetcher();
    }
    return new JQuantsFetcher();
  }

  return new MockFetcher();
}

const fetcher = buildFetcher();
console.log(`[antigravity-server] fetcher: ${fetcher.name}`);

// ---------------------------------------------------------------------------
// CORS 設定
// ---------------------------------------------------------------------------
const allowedOrigin = process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173';

export const app = new Hono();

app.use(
  '*',
  cors({
    origin: (origin) => {
      // 開発中の利便性を優先し、ローカル環境や拡張機能からのリクエストは常に許可
      if (!origin || origin === 'null') return '*'; 
      if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1') || origin.startsWith('chrome-extension://')) {
        return origin;
      }
      if (origin === allowedOrigin) return origin;
      return allowedOrigin; // Dev fallback
    },
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    maxAge: 300,
  })
);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** ヘルスチェック — fetcher 状態・キャッシュ・トークン情報を返す */
app.get('/health', (c) => {
  const cache = snapshotCacheStats();
  const base = {
    status: 'ok',
    ts: new Date().toISOString(),
    fetcher: fetcher.name,
    cache: {
      ttlMs: cache.cacheTtlMs,
      hasEntry: cache.hasCachedEntry,
      ageMs: cache.cacheAgeMs,
      stale: cache.cacheStale,
    },
  };

  // J-Quants 固有の情報（fetcher が jquants の場合のみ追加）
  if (fetcher.name === 'jquants') {
    const tok = tokenStatus();
    return c.json({
      ...base,
      jquants: {
        hasRefreshToken: tok.hasRefreshToken,
        hasIdToken: tok.hasIdToken,
        idTokenExpiresInMs: tok.idTokenExpiresInMs,
      },
    });
  }

  return c.json(base);
});

/** スナップショット */
app.route('/market-snapshot', createSnapshotRoute(fetcher));

/** 市況情報 (Yahoo Finance) */
app.route('/api/market', marketRoute);

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

/**
 * cron スケジュールを開始する。
 * Node.js サーバー期待が前提なので、
 * Cloudflare Workers 等 serverless 環境では DISABLE_CRON=true を設定すること。
 */
startScheduler(fetcher, snapshotCache, CACHE_TTL_MS);
