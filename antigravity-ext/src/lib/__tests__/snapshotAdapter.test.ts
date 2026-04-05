/**
 * snapshotAdapter.test.ts
 *
 * snapshotToQuoteSnapshots() / quoteKindToLegacyPriceKind() / isSnapshotStale()
 * のユニットテスト。
 *
 * テストグループ:
 *  A. priceKind → quoteKind マッピング (4 ケース)
 *  B. source 文字列 → SourceMode 推定 (3 ケース)
 *  C. syncedAt 正規化 (2 ケース)
 *  D. baselineDate 補完ロジック (3 ケース)
 *  E. marketDataAt の転送 (2 ケース)
 *  F. assetId マッピング (2 ケース)
 *  G. 欠損・境界値 (4 ケース)
 *  H. isSnapshotStale (3 ケース)
 *  I. quoteKindToLegacyPriceKind (4 ケース)
 */

import { describe, it, expect } from 'vitest';
import {
  snapshotToQuoteSnapshots,
  isSnapshotStale,
  quoteKindToLegacyPriceKind,
} from '../snapshotAdapter';
import type { MarketSnapshot } from '../../types/snapshot';
import type { QuoteKind } from '../../types/market';

// ─── テスト用ファクトリ ────────────────────────────────────────────────────────

/** JST で YYYY-MM-DD HH:mm の Date を返す */
function jst(ymdHhMm: string): Date {
  const [date, time = '00:00'] = ymdHhMm.split(' ');
  return new Date(`${date}T${time}:00+09:00`);
}

/** 最小構成のスナップショット */
function makeSnapshot(
  overrides: Partial<MarketSnapshot> & { stocks?: Partial<MarketSnapshot['stocks']> } = {}
): MarketSnapshot {
  return {
    fetchedAt: '2025-04-04T02:00:00.000Z', // 11:00 JST
    stocks: overrides.stocks ?? {},
    context: {},
    ...overrides,
  };
}

/** 最小構成の StockQuote */
function makeStock(
  price: number,
  extra: {
    priceKind?: 'market' | 'close' | 'official';
    source?: string;
    syncedAt?: string;
    marketDataAt?: string;
    baselineDate?: string;
  } = {}
) {
  return {
    price,
    source: extra.source ?? 'yahoo_finance_delayed',
    priceKind: extra.priceKind,
    syncedAt: extra.syncedAt,
    marketDataAt: extra.marketDataAt,
    baselineDate: extra.baselineDate,
  };
}

// ─── A. priceKind → quoteKind マッピング ─────────────────────────────────────

describe('A: priceKind → quoteKind マッピング', () => {
  const now = jst('2025-04-04 11:00');

  it('A-1. priceKind: market → quoteKind: intraday', () => {
    const snap = makeSnapshot({ stocks: { gmopg: makeStock(800, { priceKind: 'market' }) } });
    const [q] = snapshotToQuoteSnapshots(snap, now);
    expect(q.quoteKind).toBe('intraday');
  });

  it('A-2. priceKind: close → quoteKind: close', () => {
    const snap = makeSnapshot({ stocks: { gmopg: makeStock(800, { priceKind: 'close' }) } });
    const [q] = snapshotToQuoteSnapshots(snap, now);
    expect(q.quoteKind).toBe('close');
  });

  it('A-3. priceKind: official → quoteKind: nav', () => {
    const snap = makeSnapshot({ stocks: { gmopg: makeStock(800, { priceKind: 'official' }) } });
    const [q] = snapshotToQuoteSnapshots(snap, now);
    expect(q.quoteKind).toBe('nav');
  });

  it('A-4. priceKind: undefined → quoteKind: intraday (デフォルト)', () => {
    const snap = makeSnapshot({ stocks: { gmopg: makeStock(800) } }); // priceKind なし
    const [q] = snapshotToQuoteSnapshots(snap, now);
    expect(q.quoteKind).toBe('intraday');
  });
});

// ─── B. source 文字列 → SourceMode 推定 ──────────────────────────────────────

describe('B: source → SourceMode 推定', () => {
  const now = jst('2025-04-04 11:00');

  it('B-1. "yahoo_finance_delayed" → mode: delayed', () => {
    const snap = makeSnapshot({ stocks: { gmopg: makeStock(800, { source: 'yahoo_finance_delayed' }) } });
    const [q] = snapshotToQuoteSnapshots(snap, now);
    expect(q.source.mode).toBe('delayed');
  });

  it('B-2. "realtime_feed" → mode: realtime', () => {
    const snap = makeSnapshot({ stocks: { gmopg: makeStock(800, { source: 'realtime_feed' }) } });
    const [q] = snapshotToQuoteSnapshots(snap, now);
    expect(q.source.mode).toBe('realtime');
  });

  it('B-3. "eod_provider" → mode: eod', () => {
    const snap = makeSnapshot({ stocks: { gmopg: makeStock(800, { source: 'eod_provider' }) } });
    const [q] = snapshotToQuoteSnapshots(snap, now);
    expect(q.source.mode).toBe('eod');
  });

  it('B-4. source.label にそのまま source 文字列が入る', () => {
    const snap = makeSnapshot({ stocks: { gmopg: makeStock(800, { source: 'my_provider' }) } });
    const [q] = snapshotToQuoteSnapshots(snap, now);
    expect(q.source.label).toBe('my_provider');
    expect(q.source.id).toBe('snapshot_server');
  });
});

// ─── C. syncedAt 正規化 ───────────────────────────────────────────────────────

describe('C: syncedAt 正規化', () => {
  const now = jst('2025-04-04 11:00');

  it('C-1. sq.syncedAt あり → sq.syncedAt を優先', () => {
    const sqSyncedAt = '2025-04-04T02:05:00.000Z';
    const snap = makeSnapshot({
      fetchedAt: '2025-04-04T02:00:00.000Z',
      stocks: { gmopg: makeStock(800, { syncedAt: sqSyncedAt }) },
    });
    const [q] = snapshotToQuoteSnapshots(snap, now);
    expect(q.syncedAt).toBe(sqSyncedAt);
  });

  it('C-2. sq.syncedAt なし → snapshot.fetchedAt にフォールバック', () => {
    const fetchedAt = '2025-04-04T02:00:00.000Z';
    const snap = makeSnapshot({
      fetchedAt,
      stocks: { gmopg: makeStock(800) }, // syncedAt なし
    });
    const [q] = snapshotToQuoteSnapshots(snap, now);
    expect(q.syncedAt).toBe(fetchedAt);
  });
});

// ─── D. baselineDate 補完 ─────────────────────────────────────────────────────

describe('D: baselineDate 補完', () => {

  it('D-1. sq.baselineDate あり → そのまま使う', () => {
    const now = jst('2025-04-04 11:00');
    const snap = makeSnapshot({
      stocks: { gmopg: makeStock(800, { baselineDate: '2025-04-03' }) },
    });
    const [q] = snapshotToQuoteSnapshots(snap, now);
    expect(q.baselineDate).toBe('2025-04-03');
  });

  it('D-2. baselineDate なし + marketDataAt あり → marketDataAt の JST 日付を使う', () => {
    // marketDataAt = 2025-04-04 11:00 JST
    const now = jst('2025-04-04 11:30');
    const marketDataAt = '2025-04-04T02:00:00.000Z'; // 11:00 JST
    const snap = makeSnapshot({
      stocks: { gmopg: makeStock(800, { marketDataAt }) }, // baselineDate なし
    });
    const [q] = snapshotToQuoteSnapshots(snap, now);
    expect(q.baselineDate).toBe('2025-04-04');
  });

  it('D-3. baselineDate も marketDataAt もなし → deriveBaselineDate が当日 JST 日付を返す', () => {
    // now = 2025-04-04 (平日), quoteKind = intraday → 当日を基準日とする
    const now = jst('2025-04-04 11:00');
    const snap = makeSnapshot({ stocks: { gmopg: makeStock(800) } }); // 両方なし
    const [q] = snapshotToQuoteSnapshots(snap, now);
    expect(q.baselineDate).toBe('2025-04-04');
  });
});

// ─── E. marketDataAt の転送 ───────────────────────────────────────────────────

describe('E: marketDataAt の転送', () => {
  const now = jst('2025-04-04 11:00');

  it('E-1. sq.marketDataAt あり → QuoteSnapshot に転送される', () => {
    const marketDataAt = '2025-04-04T02:00:00.000Z';
    const snap = makeSnapshot({ stocks: { gmopg: makeStock(800, { marketDataAt }) } });
    const [q] = snapshotToQuoteSnapshots(snap, now);
    expect(q.marketDataAt).toBe(marketDataAt);
  });

  it('E-2. sq.marketDataAt なし → null になる', () => {
    const snap = makeSnapshot({ stocks: { gmopg: makeStock(800) } }); // marketDataAt なし
    const [q] = snapshotToQuoteSnapshots(snap, now);
    expect(q.marketDataAt).toBeNull();
  });
});

// ─── F. assetId マッピング ────────────────────────────────────────────────────

describe('F: assetId マッピング', () => {
  const now = jst('2025-04-04 11:00');

  it('F-1. snapshot.stocks.gmopg → assetId: asset-gmopg', () => {
    const snap = makeSnapshot({ stocks: { gmopg: makeStock(800) } });
    const [q] = snapshotToQuoteSnapshots(snap, now);
    expect(q.assetId).toBe('asset-gmopg');
  });

  it('F-2. snapshot.stocks.unext → assetId: asset-unext', () => {
    const snap = makeSnapshot({ stocks: { unext: makeStock(2500) } });
    const [q] = snapshotToQuoteSnapshots(snap, now);
    expect(q.assetId).toBe('asset-unext');
  });
});

// ─── G. 欠損・境界値 ─────────────────────────────────────────────────────────

describe('G: 欠損・境界値', () => {
  const now = jst('2025-04-04 11:00');

  it('G-1. price = 0 → そのエントリはスキップされる', () => {
    const snap = makeSnapshot({ stocks: { gmopg: makeStock(0) } });
    const result = snapshotToQuoteSnapshots(snap, now);
    expect(result).toHaveLength(0);
  });

  it('G-2. stocks が空オブジェクト → 空配列を返す', () => {
    const snap = makeSnapshot({ stocks: {} });
    const result = snapshotToQuoteSnapshots(snap, now);
    expect(result).toHaveLength(0);
  });

  it('G-3. gmopg のみ存在 → 1件だけ返す', () => {
    const snap = makeSnapshot({ stocks: { gmopg: makeStock(800) } });
    const result = snapshotToQuoteSnapshots(snap, now);
    expect(result).toHaveLength(1);
    expect(result[0].assetId).toBe('asset-gmopg');
  });

  it('G-4. gmopg と unext が両方存在 → 2件返す', () => {
    const snap = makeSnapshot({
      stocks: { gmopg: makeStock(800), unext: makeStock(2500) },
    });
    const result = snapshotToQuoteSnapshots(snap, now);
    expect(result).toHaveLength(2);
    const ids = result.map(q => q.assetId).sort();
    expect(ids).toEqual(['asset-gmopg', 'asset-unext']);
  });

  it('G-5. currency は常に JPY', () => {
    const snap = makeSnapshot({ stocks: { gmopg: makeStock(800) } });
    const [q] = snapshotToQuoteSnapshots(snap, now);
    expect(q.currency).toBe('JPY');
  });

  it('G-6. assetClass は常に jp_stock', () => {
    const snap = makeSnapshot({ stocks: { unext: makeStock(2500) } });
    const [q] = snapshotToQuoteSnapshots(snap, now);
    expect(q.assetClass).toBe('jp_stock');
  });
});

// ─── H. isSnapshotStale ───────────────────────────────────────────────────────

describe('H: isSnapshotStale', () => {

  it('H-1. _meta.stale: true → true', () => {
    const snap = makeSnapshot({ _meta: { fetcher: 'test', cacheHit: false, stale: true } });
    expect(isSnapshotStale(snap)).toBe(true);
  });

  it('H-2. _meta.stale: false → false', () => {
    const snap = makeSnapshot({ _meta: { fetcher: 'test', cacheHit: false, stale: false } });
    expect(isSnapshotStale(snap)).toBe(false);
  });

  it('H-3. _meta: undefined → false', () => {
    const snap = makeSnapshot(); // _meta なし
    expect(isSnapshotStale(snap)).toBe(false);
  });
});

// ─── I. quoteKindToLegacyPriceKind ───────────────────────────────────────────

describe('I: quoteKindToLegacyPriceKind', () => {
  const cases: [QuoteKind, string][] = [
    ['intraday',  'market'],
    ['close',     'close'],
    ['nav',       'official'],
    ['reference', 'reference'],
  ];

  it.each(cases)('I: %s → %s', (quoteKind, expected) => {
    expect(quoteKindToLegacyPriceKind(quoteKind)).toBe(expected);
  });
});
