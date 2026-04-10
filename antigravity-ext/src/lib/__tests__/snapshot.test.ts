/**
 * snapshot.test.ts
 *
 * 通知文面のスナップショットテスト。
 * generateSummaryText() / buildQuoteSummaryLine() の出力断片を凍結し、
 * 将来の文面崩れを即検知する。
 *
 * シナリオ入力は fixtures/marketScenarios.ts で一元管理。
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
 */

import { describe, it, expect } from 'vitest';
import { generateSummaryText, buildQuoteSummaryLine } from '../summaryText';
import {
  scenarios,
  makeStock,
  makeFund,
  PREV_BIZ,
} from './fixtures/marketScenarios';

// ─── S1: 平日朝 ───────────────────────────────────────────────────────────────

describe('S1: 平日朝 — close + nav', () => {
  const { now, quotes } = scenarios.weekdayMorningCloseNav;

  it('終値 と 基準価額 が出る', () => {
    const text = generateSummaryText({ quotes, now });
    expect(text).toContain('終値');
    expect(text).toContain('基準価額');
  });

  it('現在値 は出ない', () => {
    const text = generateSummaryText({ quotes, now });
    expect(text).not.toContain('現在値');
  });

  it('やや遅延 / 更新注意 は出ない (通常朝の状態)', () => {
    const text = generateSummaryText({ quotes, now });
    expect(text).not.toContain('やや遅延');
    expect(text).not.toContain('更新注意');
  });

  it('GMOPG 行が 4/3 終値 断片を持つ', () => {
    const line = buildQuoteSummaryLine(makeStock({ quoteKind: 'close', baselineDate: PREV_BIZ }), now);
    expect(line).toMatch(/GMOPG: 4\/3 終値 /);
  });

  it('AB 行が 4/3 基準価額 断片を持つ', () => {
    const line = buildQuoteSummaryLine(makeFund({ quoteKind: 'nav', baselineDate: PREV_BIZ }), now);
    expect(line).toMatch(/AB: 4\/3 基準価額 /);
  });
});

// ─── S2: 場中 fresh ───────────────────────────────────────────────────────────

describe('S2: 場中 fresh — intraday 10 分前', () => {
  const { now, quotes } = scenarios.intradayFresh;

  it('現在値 が出る', () => {
    const line = buildQuoteSummaryLine(quotes[0], now);
    expect(line).toContain('現在値');
  });

  it('終値 / 基準価額 は出ない', () => {
    const line = buildQuoteSummaryLine(quotes[0], now);
    expect(line).not.toContain('終値');
    expect(line).not.toContain('基準価額');
  });

  it('やや遅延 / 更新注意 は出ない', () => {
    const line = buildQuoteSummaryLine(quotes[0], now);
    expect(line).not.toContain('やや遅延');
    expect(line).not.toContain('更新注意');
  });

  it('generateSummaryText でも 現在値 が出る', () => {
    const text = generateSummaryText({ quotes, now });
    expect(text).toContain('現在値');
  });
});

// ─── S3: 場中 lagging ────────────────────────────────────────────────────────

describe('S3: 場中 lagging — intraday 30 分前', () => {
  const { now, quotes } = scenarios.intradayLagging;

  it('やや遅延 が出る', () => {
    const line = buildQuoteSummaryLine(quotes[0], now);
    expect(line).toContain('やや遅延');
  });

  it('現在値 は出ない', () => {
    const line = buildQuoteSummaryLine(quotes[0], now);
    expect(line).not.toContain('現在値');
  });

  it('時点 が出る (asOfLabel に hh:mm時点 が含まれる)', () => {
    const line = buildQuoteSummaryLine(quotes[0], now);
    expect(line).toContain('時点');
  });

  it('更新注意 は出ない (stale ではなく lagging)', () => {
    const line = buildQuoteSummaryLine(quotes[0], now);
    expect(line).not.toContain('更新注意');
  });

  it('generateSummaryText でも やや遅延 が出る', () => {
    const text = generateSummaryText({ quotes, now });
    expect(text).toContain('やや遅延');
    expect(text).not.toContain('現在値');
  });
});

// ─── S4: stale 混在 + 候補理由 ───────────────────────────────────────────────

describe('S4: stale 混在 + 候補ブロック理由', () => {
  const { now, quotes, candidateBlockReason } = scenarios.staleWithCandidateBlock;
  const [staleStock, freshFund] = quotes;

  it('stale 資産に 更新注意 が出る', () => {
    const line = buildQuoteSummaryLine(staleStock, now);
    expect(line).toContain('更新注意');
  });

  it('fresh な nav に 更新注意 は出ない', () => {
    const line = buildQuoteSummaryLine(freshFund, now);
    expect(line).not.toContain('更新注意');
    expect(line).toContain('基準価額');
  });

  it('generateSummaryText: 更新注意 と 基準価額 が共存する', () => {
    const text = generateSummaryText({ quotes, now });
    expect(text).toContain('更新注意');
    expect(text).toContain('基準価額');
  });

  it('candidateBlockReason=market_context_missing → 市場コンテキスト未同期 が出る', () => {
    const text = generateSummaryText({ quotes, now, candidateBlockReason });
    expect(text).toContain('市場コンテキスト未同期');
  });

  it('現在値 は一切出ない', () => {
    const text = generateSummaryText({ quotes, now, candidateBlockReason });
    expect(text).not.toContain('現在値');
  });
});

// ─── クロスチェック: 現在値 混入防止 ─────────────────────────────────────────

describe('クロスチェック: 現在値 混入防止', () => {
  const { now, quotes } = scenarios.mixedNoCurrentLeak;

  it('close + nav + reference 混在で 現在値 が出ない', () => {
    const text = generateSummaryText({ quotes, now });
    expect(text).not.toContain('現在値');
  });

  it('stale intraday で 現在値 が出ない', () => {
    const q = makeStock({
      quoteKind:    'intraday',
      baselineDate: PREV_BIZ,
      marketDataAt: `${PREV_BIZ}T10:00:00+09:00`,
    });
    const text = generateSummaryText({ quotes: [q], now });
    expect(text).not.toContain('現在値');
  });
});

// ─── fixture 網羅チェック: expectedFragments を機械的に検証 ──────────────────

describe('fixture expectedFragments 網羅チェック', () => {
  const allScenarios = Object.entries(scenarios) as [string, typeof scenarios[keyof typeof scenarios]][];

  for (const [name, scenario] of allScenarios) {
    it(`${name}: include が全て出る`, () => {
      const text = generateSummaryText({
        quotes: scenario.quotes,
        now: scenario.now,
        candidateBlockReason: scenario.candidateBlockReason,
      });
      for (const fragment of scenario.expectedFragments.include) {
        expect(text, `"${fragment}" が見つからない (scenario: ${name})`).toContain(fragment);
      }
    });

    it(`${name}: exclude が一切出ない`, () => {
      const text = generateSummaryText({
        quotes: scenario.quotes,
        now: scenario.now,
        candidateBlockReason: scenario.candidateBlockReason,
      });
      for (const fragment of scenario.expectedFragments.exclude) {
        expect(text, `"${fragment}" が混入している (scenario: ${name})`).not.toContain(fragment);
      }
    });
  }
});
