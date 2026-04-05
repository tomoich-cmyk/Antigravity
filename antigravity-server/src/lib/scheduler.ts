/**
 * scheduler.ts — node-cron による定時スナップショット更新
 *
 * スケジュール（JST / Asia/Tokyo）:
 *   11:35  前場大引け前  （東証は 11:30 大引け → データ確定タイミング）
 *   15:05  後場大引け後  （東証は 15:00 大引け → 少し待ってから取得）
 *   21:00  夜間          （米国市場開始前 + 為替・指数の夕方確認）
 *
 * 使い方:
 *   import { startScheduler } from './lib/scheduler.js';
 *   startScheduler(fetcher, cache);
 *
 * 環境変数:
 *   DISABLE_CRON=true  — cron を無効化（テスト / Serverless 環境向け）
 */

import cron from 'node-cron';
import type { IMarketFetcher } from '../fetchers/types.js';
import type { MarketSnapshot } from '../types/snapshot.js';
import type { MemoryCache } from './cache.js';

const CACHE_KEY = 'snapshot:latest';

// スケジュール定義（秒 分 時 日 月 曜日）
// node-cron は JST を直接指定できる（timezone オプション）
const SCHEDULES = [
  { label: '前場引け後 (11:35 JST)', cron: '35 11 * * 1-5' },
  { label: '後場引け後 (15:05 JST)', cron: '5 15 * * 1-5'  },
  { label: '夜間 (21:00 JST)',        cron: '0 21 * * 1-5'  },
] as const;

const TIMEZONE = 'Asia/Tokyo';

/**
 * スナップショットを取得してキャッシュを更新する。
 * エラーは握り潰さずログに出し、既存キャッシュを温存する。
 */
async function refreshSnapshot(
  fetcher: IMarketFetcher,
  cache: MemoryCache<MarketSnapshot>,
  cacheTtlMs: number,
  label: string
): Promise<void> {
  console.log(`[scheduler] ${label} — refreshing snapshot (fetcher: ${fetcher.name})`);
  try {
    const snapshot = await fetcher.fetch();

    // 取得データの鮮度（Stale）判定をポストプロセスで実行
    const STALE_THRESHOLD_OFFICIAL_HOURS = 48; // 投信などは48時間
    const STALE_THRESHOLD_MARKET_HOURS   = 24; // 株式などは24時間
    const now = new Date();

    Object.values(snapshot.stocks).forEach(quote => {
      if (!quote || !quote.marketDataAt) return;
      const dataTime = new Date(quote.marketDataAt);
      const diffHours = (now.getTime() - dataTime.getTime()) / (1000 * 60 * 60);
      const threshold = quote.priceKind === 'official' ? STALE_THRESHOLD_OFFICIAL_HOURS : STALE_THRESHOLD_MARKET_HOURS;
      
      if (diffHours > threshold) {
        quote.isStale = true;
      }
    });

    cache.set(CACHE_KEY, snapshot, cacheTtlMs);
    const stks = snapshot.stocks;
    const ctx  = snapshot.context;
    console.log(
      `[scheduler] ${label} — OK: ` +
      `GMOPG=${stks.gmopg?.price ?? 'n/a'} ` +
      `UNEXT=${stks.unext?.price ?? 'n/a'} ` +
      `USDJPY=${ctx.usdJpy?.price ?? 'n/a'} ` +
      `SPY=${ctx.usProxy?.changePct != null ? ctx.usProxy.changePct + '%' : 'n/a'} ` +
      `VT=${ctx.worldProxy?.changePct != null ? ctx.worldProxy.changePct + '%' : 'n/a'}`
    );
  } catch (err) {
    console.error(
      `[scheduler] ${label} — FAILED: ${(err as Error).message} (cache retained)`
    );
  }
}

/**
 * cron ジョブを登録して開始する。
 *
 * @param fetcher  使用する fetcher（DI）
 * @param cache    snapshot ルートと共有するキャッシュインスタンス
 * @param cacheTtlMs  キャッシュ TTL（ms）
 * @returns 登録した ScheduledTask の配列（停止用）
 */
export function startScheduler(
  fetcher: IMarketFetcher,
  cache: MemoryCache<MarketSnapshot>,
  cacheTtlMs: number
): cron.ScheduledTask[] {
  if (process.env.DISABLE_CRON === 'true') {
    console.log('[scheduler] DISABLE_CRON=true — cron skipped');
    return [];
  }

  const tasks = SCHEDULES.map(({ label, cron: schedule }) => {
    const task = cron.schedule(
      schedule,
      () => {
        void refreshSnapshot(fetcher, cache, cacheTtlMs, label);
      },
      { timezone: TIMEZONE }
    );
    console.log(`[scheduler] registered: "${label}" (${schedule} ${TIMEZONE})`);
    return task;
  });

  return tasks;
}
