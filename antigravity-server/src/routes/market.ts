import { Hono } from 'hono';
import { fetchAllContext } from '../fetchers/yahoo.js';

export const marketRoute = new Hono();

/**
 * GET /api/market/context
 * Yahoo Finance から為替・インデックスの騰落率を取得して返す。
 */
marketRoute.get('/context', async (c) => {
  try {
    const context = await fetchAllContext();
    return c.json({
      success: true,
      data: context,
      ts: new Date().toISOString()
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Market context fetch failed';
    console.error(`[api/market/context] Error: ${msg}`, err);
    return c.json({
      success: false,
      error: msg
    }, 500);
  }
});
