/**
 * freshness.test.ts
 *
 * evaluateFreshness() のユニットテスト。
 * 全テストは固定した「現在時刻 (now)」を使い、Date.now() に依存しない。
 *
 * テストケース一覧:
 *  1. [intraday] 平日朝: 前営業日終値 → stale
 *  2. [intraday] 場中: marketDataAt が 15 分前 → fresh, canPretendCurrent=true
 *  3. [intraday] 場中: marketDataAt が 45 分前 → lagging
 *  4. [intraday] 場中: marketDataAt が 2 時間前 → stale
 *  5. [intraday] 場中: marketDataAt なし → unknown
 *  6. [close]    当日終値 → fresh
 *  7. [close]    前営業日終値 (翌朝) → fresh
 *  8. [close]    3 営業日前終値 → stale
 *  9. [nav]      前営業日基準価額 → fresh
 * 10. [nav]      2 営業日前基準価額 (祝日挟み) → lagging
 * 11. [nav]      4 営業日前基準価額 → stale
 * 12. [reference] 前営業日参考価格 → lagging (未確定)
 * 13. [reference] 3 営業日前参考価格 → stale
 *
 * 場中シナリオ (priceLabel 検証):
 * 14. [intraday] 場中: marketDataAt=10分前 → fresh, canPretendCurrent=true, priceLabel="現在値"
 * 15. [intraday] 場中: marketDataAt=40分前 → lagging, canPretendCurrent=false, priceLabel≠"現在値"
 * 16. [close]    当日終値 → canPretendCurrent=false, priceLabel="終値"
 * 17. [nav]      前営業日基準価額 → canPretendCurrent=false, priceLabel="基準価額"
 */

import { describe, it, expect } from 'vitest';
import { evaluateFreshness } from '../freshness';
import type { QuoteSnapshot } from '../../types/market';

// ─── テスト用ファクトリ ────────────────────────────────────────────────────────
function makeQuote(overrides: Partial<QuoteSnapshot> & Pick<QuoteSnapshot, 'quoteKind' | 'baselineDate'>): QuoteSnapshot {
  return {
    assetId: 'test-asset',
    assetClass: 'jp_stock',
    value: 1000,
    currency: 'JPY',
    source: { id: 'mock', mode: 'mock', label: 'テスト' },
    syncedAt: new Date('2025-04-04T05:00:00Z').toISOString(), // 14:00 JST
    ...overrides,
  };
}

/** JST で YYYY-MM-DD HH:mm の Date を作る */
function jst(ymdHhMm: string): Date {
  // "2025-04-04 11:00" → "2025-04-04T11:00:00+09:00"
  const [date, time] = ymdHhMm.split(' ');
  return new Date(`${date}T${time ?? '00:00'}:00+09:00`);
}

// ─── テスト ───────────────────────────────────────────────────────────────────

describe('evaluateFreshness — intraday (jp_stock)', () => {

  it('1. 平日朝: marketDataAt が前営業日 → stale', () => {
    // 現在: 2025-04-04 (金) 09:15 JST
    const now = jst('2025-04-04 09:15');
    const quote = makeQuote({
      quoteKind: 'intraday',
      baselineDate: '2025-04-03',
      marketDataAt: new Date('2025-04-03T06:00:00Z').toISOString(), // 4/3 15:00 JST
      syncedAt:     new Date('2025-04-03T06:00:00Z').toISOString(),
    });
    const result = evaluateFreshness({ quote, now });
    expect(result.isStale).toBe(true);
    expect(result.level).toBe('stale');
    expect(result.canPretendCurrent).toBe(false);
  });

  it('2. 場中: marketDataAt が 15 分前 → fresh, canPretendCurrent=true', () => {
    // 現在: 2025-04-04 (金) 10:30 JST
    const now = jst('2025-04-04 10:30');
    // marketDataAt = 10:15 JST
    const marketDataAt = jst('2025-04-04 10:15').toISOString();
    const quote = makeQuote({
      quoteKind: 'intraday',
      baselineDate: '2025-04-04',
      marketDataAt,
      syncedAt: jst('2025-04-04 10:28').toISOString(),
    });
    const result = evaluateFreshness({ quote, now });
    expect(result.isStale).toBe(false);
    expect(result.level).toBe('fresh');
    expect(result.canPretendCurrent).toBe(true);
  });

  it('3. 場中: marketDataAt が 45 分前 → lagging', () => {
    const now = jst('2025-04-04 10:45');
    const marketDataAt = jst('2025-04-04 10:00').toISOString();
    const quote = makeQuote({
      quoteKind: 'intraday',
      baselineDate: '2025-04-04',
      marketDataAt,
      syncedAt: jst('2025-04-04 10:00').toISOString(),
    });
    const result = evaluateFreshness({ quote, now });
    expect(result.isStale).toBe(false);
    expect(result.level).toBe('lagging');
    expect(result.canPretendCurrent).toBe(false);
  });

  it('4. 場中: marketDataAt が 2 時間前 → stale', () => {
    const now = jst('2025-04-04 11:20');
    const marketDataAt = jst('2025-04-04 09:10').toISOString();
    const quote = makeQuote({
      quoteKind: 'intraday',
      baselineDate: '2025-04-04',
      marketDataAt,
      syncedAt: jst('2025-04-04 09:10').toISOString(),
    });
    const result = evaluateFreshness({ quote, now });
    expect(result.isStale).toBe(true);
    expect(result.level).toBe('stale');
  });

  it('5. 場中: marketDataAt なし → unknown', () => {
    const now = jst('2025-04-04 10:00');
    const quote = makeQuote({
      quoteKind: 'intraday',
      baselineDate: '2025-04-04',
      marketDataAt: null,
      syncedAt: jst('2025-04-04 09:55').toISOString(),
    });
    const result = evaluateFreshness({ quote, now });
    expect(result.level).toBe('unknown');
    expect(result.canPretendCurrent).toBe(false);
    expect(result.reason).toBe('missing_market_time');
  });

});

describe('evaluateFreshness — close (jp_stock)', () => {

  it('6. 当日終値 (15:45 JST) → fresh', () => {
    const now = jst('2025-04-04 15:45');
    const quote = makeQuote({
      quoteKind: 'close',
      baselineDate: '2025-04-04',
      assetClass: 'jp_stock',
      syncedAt: jst('2025-04-04 15:35').toISOString(),
    });
    const result = evaluateFreshness({ quote, now });
    expect(result.isStale).toBe(false);
    expect(result.level).toBe('fresh');
  });

  it('7. 前営業日終値 (翌朝 8:00) → fresh', () => {
    // 2025-04-07 (月) 朝: 前営業日 2025-04-04 の終値
    const now = jst('2025-04-07 08:00');
    const quote = makeQuote({
      quoteKind: 'close',
      baselineDate: '2025-04-04',
      assetClass: 'jp_stock',
      syncedAt: jst('2025-04-04 15:35').toISOString(),
    });
    const result = evaluateFreshness({ quote, now });
    expect(result.isStale).toBe(false);
    expect(result.level).toBe('fresh');
    expect(result.reason).toBe('market_closed');
  });

  it('8. 3 営業日前終値 → stale', () => {
    // 2025-04-09 (水): 2025-04-04 (金) の終値
    const now = jst('2025-04-09 10:00');
    const quote = makeQuote({
      quoteKind: 'close',
      baselineDate: '2025-04-04',
      assetClass: 'jp_stock',
      syncedAt: jst('2025-04-04 15:35').toISOString(),
    });
    const result = evaluateFreshness({ quote, now });
    expect(result.isStale).toBe(true);
    expect(result.level).toBe('stale');
  });

});

describe('evaluateFreshness — nav (mutual_fund)', () => {

  it('9. 前営業日基準価額 → fresh', () => {
    // 現在: 2025-04-04 (金) 15:00, 基準日: 2025-04-03 (木)
    const now = jst('2025-04-04 15:00');
    const quote = makeQuote({
      quoteKind: 'nav',
      baselineDate: '2025-04-03',
      assetClass: 'mutual_fund',
      syncedAt: jst('2025-04-04 09:00').toISOString(),
    });
    const result = evaluateFreshness({ quote, now });
    expect(result.isStale).toBe(false);
    expect(result.level).toBe('fresh');
  });

  it('10. 2 営業日前基準価額 (週末挟み連休明け) → lagging', () => {
    // 現在: 2025-04-07 (月), 基準日: 2025-04-03 (木)
    // 土日を挟むと 4/4(金) + 4/7(月) = 2 営業日差 → lagging
    const now = jst('2025-04-07 10:00');
    const quote = makeQuote({
      quoteKind: 'nav',
      baselineDate: '2025-04-03',
      assetClass: 'mutual_fund',
      syncedAt: jst('2025-04-04 09:00').toISOString(),
    });
    // isHolidayProvider 省略 → デフォルト (土日のみ)
    const result = evaluateFreshness({ quote, now });
    expect(result.isStale).toBe(false);
    expect(result.level).toBe('lagging');
    expect(result.reason).toBe('holiday_gap');
  });

  it('11. 4 営業日前基準価額 → stale', () => {
    // 現在: 2025-04-09 (水), 基準日: 2025-04-03 (木) = 4 営業日前
    const now = jst('2025-04-09 10:00');
    const quote = makeQuote({
      quoteKind: 'nav',
      baselineDate: '2025-04-03',
      assetClass: 'mutual_fund',
      syncedAt: jst('2025-04-04 09:00').toISOString(),
    });
    const result = evaluateFreshness({ quote, now });
    expect(result.isStale).toBe(true);
    expect(result.level).toBe('stale');
    expect(result.reason).toBe('nav_not_updated');
  });

});

describe('evaluateFreshness — reference (mutual_fund)', () => {

  it('12. 前営業日参考価格 → lagging (未確定)', () => {
    const now = jst('2025-04-04 09:00');
    const quote = makeQuote({
      quoteKind: 'reference',
      baselineDate: '2025-04-03',
      assetClass: 'mutual_fund',
      syncedAt: jst('2025-04-04 08:30').toISOString(),
    });
    const result = evaluateFreshness({ quote, now });
    expect(result.isStale).toBe(false);
    expect(result.level).toBe('lagging');
    expect(result.reason).toBe('market_closed');
  });

  it('13. 3 営業日前参考価格 → stale', () => {
    const now = jst('2025-04-09 10:00');
    const quote = makeQuote({
      quoteKind: 'reference',
      baselineDate: '2025-04-04',
      assetClass: 'mutual_fund',
      syncedAt: jst('2025-04-04 08:00').toISOString(),
    });
    const result = evaluateFreshness({ quote, now });
    expect(result.isStale).toBe(true);
    expect(result.level).toBe('stale');
  });

});

// ─── 場中シナリオ: priceLabel / canPretendCurrent の詳細検証 ─────────────────

describe('evaluateFreshness — 場中シナリオ (priceLabel 検証)', () => {

  it('14. [intraday] 場中: marketDataAt=10分前 → fresh, canPretendCurrent=true, priceLabel="現在値"', () => {
    // 現在: 2025-04-04 (金) 10:00 JST (前場)
    const now = jst('2025-04-04 10:00');
    const marketDataAt = jst('2025-04-04 09:50').toISOString(); // 10分前
    const quote = makeQuote({
      quoteKind: 'intraday',
      baselineDate: '2025-04-04',
      marketDataAt,
      syncedAt: jst('2025-04-04 09:58').toISOString(),
    });
    const result = evaluateFreshness({ quote, now });
    expect(result.level).toBe('fresh');
    expect(result.canPretendCurrent).toBe(true);
    expect(result.priceLabel).toBe('現在値');
    expect(result.isStale).toBe(false);
  });

  it('15. [intraday] 場中: marketDataAt=40分前 → lagging, canPretendCurrent=false, priceLabel≠"現在値"', () => {
    // 現在: 2025-04-04 (金) 10:40 JST (前場)
    const now = jst('2025-04-04 10:40');
    const marketDataAt = jst('2025-04-04 10:00').toISOString(); // 40分前
    const quote = makeQuote({
      quoteKind: 'intraday',
      baselineDate: '2025-04-04',
      marketDataAt,
      syncedAt: jst('2025-04-04 10:00').toISOString(),
    });
    const result = evaluateFreshness({ quote, now });
    expect(result.level).toBe('lagging');
    expect(result.canPretendCurrent).toBe(false);
    expect(result.priceLabel).not.toBe('現在値');
    expect(result.isStale).toBe(false);
  });

  it('16. [close] 当日終値 → canPretendCurrent=false, priceLabel="終値"', () => {
    const now = jst('2025-04-04 16:00');
    const quote = makeQuote({
      quoteKind: 'close',
      baselineDate: '2025-04-04',
      assetClass: 'jp_stock',
      syncedAt: jst('2025-04-04 15:35').toISOString(),
    });
    const result = evaluateFreshness({ quote, now });
    expect(result.canPretendCurrent).toBe(false);
    expect(result.priceLabel).toBe('終値');
  });

  it('17. [nav] 前営業日基準価額 → canPretendCurrent=false, priceLabel="基準価額"', () => {
    const now = jst('2025-04-04 15:00');
    const quote = makeQuote({
      quoteKind: 'nav',
      baselineDate: '2025-04-03',
      assetClass: 'mutual_fund',
      syncedAt: jst('2025-04-04 09:00').toISOString(),
    });
    const result = evaluateFreshness({ quote, now });
    expect(result.canPretendCurrent).toBe(false);
    expect(result.priceLabel).toBe('基準価額');
  });

});
