/**
 * snapshot.test.ts
 *
 * 通知文面のスナップショットテスト。
 * generateSummaryText() / buildQuoteSummaryLine() の出力断片を凍結し、
 * 将来の文面崩れを即検知する。
 *
 * ─── 固定断片の意味 ─────────────────────────────────────────────────
 *   "現在値"             canPretendCurrent=true (場中 intraday 20分以内) のみ
 *   "終値"               close quoteKind の正常ラベル
 *   "基準価額"           nav quoteKind の正常ラベル
 *   "参考"               reference quoteKind の正常ラベル
 *   "やや遅延"           lagging (20〜60 分の intraday)
 *   "更新注意"           stale (前営業日以前データ)
 *   "市場コンテキスト未同期"  候補ブロック理由 market_context_missing
 * ────────────────────────────────────────────────────────────────────
 *
 * シナリオ一覧:
 *   S1. 平日朝: close (前営業日終値) + nav (前営業日基準価額)
 *   S2. 場中 fresh: intraday 10 分前 → 現在値
 *   S3. 場中 lagging: intraday 30 分前 → やや遅延
 *   S4. stale 混在 + 候補ブロック理由
 */

import { describe, it, expect } from 'vitest';
import type { QuoteSnapshot } from '../../types/market';
import { generateSummaryText, buildQuoteSummaryLine } from '../summaryText';

// ─── 共通ファクトリ ────────────────────────────────────────────────────────────

/**
 * 2026-04-06 (月) = S1〜S4 共通の "基準日"
 * April 2026: April 1 = 水曜 → April 6 = 月曜
 */
const TODAY = '2026-04-06';
/** 前営業日 = 2026-04-03 (金) */
const PREV_BIZ = '2026-04-03';

function stock(partial: Partial<QuoteSnapshot>): QuoteSnapshot {
  return {
    assetId:      'GMOPG',
    assetClass:   'jp_stock',
    value:        9850,
    currency:     'JPY',
    quoteKind:    'close',
    source:       { id: 'snapshot_server', mode: 'eod', label: 'Snapshot Server' },
    syncedAt:     `${TODAY}T08:01:00+09:00`,
    marketDataAt: `${PREV_BIZ}T15:30:00+09:00`,
    baselineDate: PREV_BIZ,
    ...partial,
  };
}

function fund(partial: Partial<QuoteSnapshot>): QuoteSnapshot {
  return {
    assetId:      'AB',
    assetClass:   'mutual_fund',
    value:        9117,
    currency:     'JPY',
    quoteKind:    'nav',
    source:       { id: 'broker_import', mode: 'daily_nav', label: 'Broker Import' },
    syncedAt:     `${TODAY}T08:01:00+09:00`,
    marketDataAt: null,
    baselineDate: PREV_BIZ,
    ...partial,
  };
}

// ─── S1: 平日朝 ───────────────────────────────────────────────────────────────
// now = 2026-04-06 (月) 08:30 JST (pre_open)
// GMOPG: close, baselineDate=4/3 (金) → businessDayDiff=1 → fresh, asOfLabel="4/3 終値"
// AB:    nav,   baselineDate=4/3 (金) → businessDayDiff=1 → fresh, asOfLabel="4/3 基準価額"

describe('S1: 平日朝 — close + nav', () => {
  const NOW = `${TODAY}T08:30:00+09:00`;
  const quotes = [stock(), fund()];

  it('終値 と 基準価額 が出る', () => {
    const text = generateSummaryText({ quotes, now: NOW });
    expect(text).toContain('終値');
    expect(text).toContain('基準価額');
  });

  it('現在値 は出ない', () => {
    const text = generateSummaryText({ quotes, now: NOW });
    expect(text).not.toContain('現在値');
  });

  it('やや遅延 / 更新注意 は出ない (通常朝の状態)', () => {
    const text = generateSummaryText({ quotes, now: NOW });
    expect(text).not.toContain('やや遅延');
    expect(text).not.toContain('更新注意');
  });

  it('GMOPG 行が 4/3 終値 断片を持つ', () => {
    const line = buildQuoteSummaryLine(stock(), NOW);
    expect(line).toMatch(/GMOPG: 4\/3 終値 /);
  });

  it('AB 行が 4/3 基準価額 断片を持つ', () => {
    const line = buildQuoteSummaryLine(fund(), NOW);
    expect(line).toMatch(/AB: 4\/3 基準価額 /);
  });
});

// ─── S2: 場中 fresh ───────────────────────────────────────────────────────────
// now = 2026-04-06 (月) 10:00 JST (前場)
// GMOPG: intraday, marketDataAt=09:50 (10分前) → fresh, canPretendCurrent=true → 現在値

describe('S2: 場中 fresh — intraday 10 分前', () => {
  const NOW = `${TODAY}T10:00:00+09:00`;
  const q = stock({
    quoteKind:    'intraday',
    baselineDate: TODAY,
    marketDataAt: `${TODAY}T09:50:00+09:00`,
    value:        9920,
  });

  it('現在値 が出る', () => {
    const line = buildQuoteSummaryLine(q, NOW);
    expect(line).toContain('現在値');
  });

  it('終値 / 基準価額 は出ない', () => {
    const line = buildQuoteSummaryLine(q, NOW);
    expect(line).not.toContain('終値');
    expect(line).not.toContain('基準価額');
  });

  it('やや遅延 / 更新注意 は出ない', () => {
    const line = buildQuoteSummaryLine(q, NOW);
    expect(line).not.toContain('やや遅延');
    expect(line).not.toContain('更新注意');
  });

  it('generateSummaryText でも 現在値 が出る', () => {
    const text = generateSummaryText({ quotes: [q], now: NOW });
    expect(text).toContain('現在値');
  });
});

// ─── S3: 場中 lagging ────────────────────────────────────────────────────────
// now = 2026-04-06 (月) 10:40 JST (前場)
// GMOPG: intraday, marketDataAt=10:10 (30分前) → lagging, canPretendCurrent=false

describe('S3: 場中 lagging — intraday 30 分前', () => {
  const NOW = `${TODAY}T10:40:00+09:00`;
  const q = stock({
    quoteKind:    'intraday',
    baselineDate: TODAY,
    marketDataAt: `${TODAY}T10:10:00+09:00`,
    value:        9870,
  });

  it('やや遅延 が出る', () => {
    const line = buildQuoteSummaryLine(q, NOW);
    expect(line).toContain('やや遅延');
  });

  it('現在値 は出ない', () => {
    const line = buildQuoteSummaryLine(q, NOW);
    expect(line).not.toContain('現在値');
  });

  it('時点 が出る (asOfLabel に hh:mm時点 が含まれる)', () => {
    const line = buildQuoteSummaryLine(q, NOW);
    expect(line).toContain('時点');
  });

  it('更新注意 は出ない (stale ではなく lagging)', () => {
    const line = buildQuoteSummaryLine(q, NOW);
    expect(line).not.toContain('更新注意');
  });

  it('generateSummaryText でも やや遅延 が出る', () => {
    const text = generateSummaryText({ quotes: [q], now: NOW });
    expect(text).toContain('やや遅延');
    expect(text).not.toContain('現在値');
  });
});

// ─── S4: stale 混在 + 候補理由 ───────────────────────────────────────────────
// now = 2026-04-06 (月) 09:30 JST (前場)
// GMOPG: intraday, baselineDate=4/3 (前日金曜) → stale → 更新注意
// AB:    nav,      baselineDate=4/3 → diff=1 → fresh → 基準価額
// candidateBlockReason = 'market_context_missing'

describe('S4: stale 混在 + 候補ブロック理由', () => {
  const NOW = `${TODAY}T09:30:00+09:00`;
  const staleStock = stock({
    quoteKind:    'intraday',
    baselineDate: PREV_BIZ,
    marketDataAt: `${PREV_BIZ}T10:00:00+09:00`,
    value:        9800,
  });
  const freshFund = fund(); // nav, baselineDate=4/4 → diff=1 → fresh

  it('stale 資産に 更新注意 が出る', () => {
    const line = buildQuoteSummaryLine(staleStock, NOW);
    expect(line).toContain('更新注意');
  });

  it('fresh な nav に 更新注意 は出ない', () => {
    const line = buildQuoteSummaryLine(freshFund, NOW);
    expect(line).not.toContain('更新注意');
    expect(line).toContain('基準価額');
  });

  it('generateSummaryText: 更新注意 と 基準価額 が共存する', () => {
    const text = generateSummaryText({ quotes: [staleStock, freshFund], now: NOW });
    expect(text).toContain('更新注意');
    expect(text).toContain('基準価額');
  });

  it('candidateBlockReason=market_context_missing → 市場コンテキスト未同期 が出る', () => {
    const text = generateSummaryText({
      quotes: [staleStock, freshFund],
      now: NOW,
      candidateBlockReason: 'market_context_missing',
    });
    expect(text).toContain('市場コンテキスト未同期');
  });

  it('現在値 は一切出ない (stale も fresh nav も canPretendCurrent=false)', () => {
    const text = generateSummaryText({
      quotes: [staleStock, freshFund],
      now: NOW,
      candidateBlockReason: 'market_context_missing',
    });
    expect(text).not.toContain('現在値');
  });
});

// ─── クロスチェック: 現在値 混入防止 ─────────────────────────────────────────
// close / nav / reference / stale intraday が混在しても 現在値 が出ない

describe('クロスチェック: 現在値 混入防止', () => {
  const NOW = `${TODAY}T09:30:00+09:00`;

  it('close + nav + reference で 現在値 が出ない', () => {
    const quotes: QuoteSnapshot[] = [
      stock({ quoteKind: 'close', baselineDate: PREV_BIZ }),
      fund({ quoteKind: 'nav',   baselineDate: PREV_BIZ }),
      fund({ assetId: 'REF', quoteKind: 'reference', baselineDate: PREV_BIZ }),
    ];
    const text = generateSummaryText({ quotes, now: NOW });
    expect(text).not.toContain('現在値');
  });

  it('stale intraday で 現在値 が出ない', () => {
    const q = stock({
      quoteKind:    'intraday',
      baselineDate: PREV_BIZ,
      marketDataAt: `${PREV_BIZ}T10:00:00+09:00`,
    });
    const text = generateSummaryText({ quotes: [q], now: NOW });
    expect(text).not.toContain('現在値');
  });
});
