/**
 * snapshotAdapter.ts
 *
 * MarketSnapshot (サーバーレスポンス) を QuoteSnapshot[] に変換する。
 *
 * 責務:
 *  - スナップショットキー ("gmopg", "unext") → 内部 assetId のマッピング
 *  - StockQuote.priceKind → QuoteKind の変換
 *  - baselineDate が欠落していた場合の補完 (deriveBaselineDate)
 *  - syncedAt の正規化 (StockQuote.syncedAt → snapshot.fetchedAt → now)
 */

import type { MarketSnapshot, StockQuote } from '../types/snapshot';
import type { QuoteSnapshot, QuoteKind, SourceMode } from '../types/market';
import { deriveBaselineDate } from './baselineDate';

/** portfolio.ts の saveAssetPrice に渡す priceKind の型 */
type LegacyPriceKind = 'market' | 'close' | 'official' | 'reference';

// ─── 資産 ID マッピング ────────────────────────────────────────────────────────
/**
 * snapshot.stocks のキー → 内部 assetId
 * 新銘柄を追加する際はここだけを編集する。
 */
const STOCK_ASSET_MAP: Readonly<Record<string, string>> = {
  gmopg: 'asset-gmopg',
  unext: 'asset-unext',
} as const;

// ─── 型変換ヘルパー ───────────────────────────────────────────────────────────

/** StockQuote.priceKind → QuoteKind */
function toQuoteKind(priceKind?: string): QuoteKind {
  if (priceKind === 'close') return 'close';
  if (priceKind === 'official') return 'nav';
  return 'intraday'; // 'market' or undefined → intraday
}

/** source 文字列から SourceMode を推定 */
function toSourceMode(source: string): SourceMode {
  const s = source.toLowerCase();
  if (s.includes('realtime'))            return 'realtime';
  if (s.includes('eod') || s.includes('close')) return 'eod';
  return 'delayed'; // yahoo / delayed / その他
}

// ─── QuoteKind ↔ legacy PriceKind ────────────────────────────────────────────

/**
 * QuoteKind → legacy AssetPriceState.priceKind
 * portfolio.ts の saveAssetPrice() に渡すために必要。
 */
export function quoteKindToLegacyPriceKind(qk: QuoteKind): LegacyPriceKind {
  if (qk === 'nav')       return 'official' as LegacyPriceKind;
  if (qk === 'reference') return 'reference' as LegacyPriceKind;
  if (qk === 'close')     return 'close' as LegacyPriceKind;
  return 'market' as LegacyPriceKind; // intraday
}

// ─── コア変換 ─────────────────────────────────────────────────────────────────

function stockQuoteToQuoteSnapshot(
  assetId: string,
  sq: StockQuote,
  fetchedAt: string,
  now: Date,
): QuoteSnapshot {
  const quoteKind  = toQuoteKind(sq.priceKind);
  const syncedAt   = sq.syncedAt ?? fetchedAt;
  const baselineDate = sq.baselineDate ?? deriveBaselineDate({
    assetClass: 'jp_stock',
    quoteKind,
    marketDataAt: sq.marketDataAt,
    now,
  });

  return {
    assetId,
    assetClass: 'jp_stock',
    value: sq.price,
    currency: 'JPY',
    quoteKind,
    source: {
      id: 'snapshot_server',
      mode: toSourceMode(sq.source),
      label: sq.source,
    },
    syncedAt,
    marketDataAt: sq.marketDataAt ?? null,
    baselineDate,
  };
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * MarketSnapshot を QuoteSnapshot[] に変換する。
 *
 * - STOCK_ASSET_MAP に登録されている銘柄のみ対象
 * - price が 0 / undefined の場合はスキップ
 * - snapshot._meta.stale が true の場合も変換するが呼び出し側で判断可能
 */
export function snapshotToQuoteSnapshots(
  snapshot: MarketSnapshot,
  now: Date = new Date(),
): QuoteSnapshot[] {
  const result: QuoteSnapshot[] = [];

  for (const [key, assetId] of Object.entries(STOCK_ASSET_MAP)) {
    const sq = snapshot.stocks[key as keyof typeof snapshot.stocks];
    if (sq?.price) {
      result.push(stockQuoteToQuoteSnapshot(assetId, sq, snapshot.fetchedAt, now));
    }
  }

  return result;
}

/**
 * スナップショットが部分的または全体的に stale かどうかを返す。
 * backgroundTasks での警告ログに使用。
 */
export function isSnapshotStale(snapshot: MarketSnapshot): boolean {
  return snapshot._meta?.stale === true;
}
