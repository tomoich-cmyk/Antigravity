/**
 * generateSummary.test.ts
 *
 * generateSummaryText() の準統合テスト。
 * シナリオ入力は fixtures/marketScenarios.ts で一元管理。
 */

import { describe, it, expect } from 'vitest';
import { generateSummaryText } from '../summaryText';
import {
  scenarios,
  makeStock,
  makeFund,
  TODAY,
  PREV_BIZ,
} from './fixtures/marketScenarios';

describe('generateSummaryText', () => {

  it('1. 株・投信・候補理由をまとめても 1 行ずつ意味が崩れない', () => {
    // S4 ベース + GMOPG を fresh intraday に差し替えた混在シナリオ
    const quotes = [
      makeStock({
        assetId:      'GMOPG',
        quoteKind:    'intraday',
        baselineDate: TODAY,
        marketDataAt: `${TODAY}T09:20:00+09:00`,
        value:        9920,
      }),
      makeStock({
        assetId:      'U-NEXT',
        quoteKind:    'close',
        baselineDate: PREV_BIZ,
        marketDataAt: `${PREV_BIZ}T15:30:00+09:00`,
        value:        4210,
      }),
      makeFund({
        assetId:      'AB',
        quoteKind:    'nav',
        baselineDate: PREV_BIZ,
        value:        9117,
      }),
    ];

    const text = generateSummaryText({
      quotes,
      now: `${TODAY}T09:30:00+09:00`,
      candidateBlockReason: 'market_context_missing',
    });

    expect(text).toContain('GMOPG');
    expect(text).toContain('現在値');

    expect(text).toContain('U-NEXT');
    expect(text).toContain('終値');
    expect(text).not.toMatch(/U-NEXT.*現在値/);

    expect(text).toContain('AB');
    expect(text).toContain('基準価額');
    expect(text).not.toMatch(/AB.*現在値/);

    expect(text).toContain('市場コンテキスト未同期');
  });

  it('2. lagging intraday は 現在値 にならず asOfLabel + やや遅延', () => {
    const { now, quotes } = scenarios.intradayLagging;
    const text = generateSummaryText({ quotes, now });

    expect(text).not.toContain('現在値');
    expect(text).toContain('時点');
    expect(text).toContain('やや遅延');
  });

  it('3. canPretendCurrent=false の資産に 現在値 が混入しない', () => {
    const { now, quotes } = scenarios.mixedNoCurrentLeak;
    const text = generateSummaryText({ quotes, now });

    expect(text).not.toMatch(/U-NEXT.*現在値/);
    expect(text).not.toMatch(/AB.*現在値/);
  });

  it('4. candidateBlockReason なし → 理由行が出ない', () => {
    const { now, quotes } = scenarios.intradayFresh;
    const text = generateSummaryText({ quotes, now });

    expect(text).not.toContain('未同期');
    expect(text).not.toContain('鮮度');
    expect(text).not.toContain('閾値');
    expect(text.split('\n')).toHaveLength(1);
  });

  it('5. stale 資産が 更新注意 を出しても他行には影響しない', () => {
    const staleStock = makeStock({
      assetId:      'GMOPG',
      quoteKind:    'intraday',
      baselineDate: PREV_BIZ,
      marketDataAt: `${PREV_BIZ}T10:00:00+09:00`,
      value:        9800,
    });
    const freshStock = makeStock({
      assetId:      'U-NEXT',
      quoteKind:    'intraday',
      baselineDate: TODAY,
      marketDataAt: `${TODAY}T09:20:00+09:00`,
      value:        4210,
    });

    const text = generateSummaryText({
      quotes: [staleStock, freshStock],
      now: `${TODAY}T09:30:00+09:00`,
    });

    expect(text).toMatch(/GMOPG.*更新注意/);
    expect(text).toMatch(/U-NEXT.*現在値/);
  });

  it('6. reference は 参考 で出る、現在値 は出ない', () => {
    const q = makeFund({
      assetId:      'AB',
      quoteKind:    'reference',
      baselineDate: PREV_BIZ,
    });

    const text = generateSummaryText({
      quotes: [q],
      now: `${TODAY}T09:30:00+09:00`,
    });

    expect(text).toContain('参考');
    expect(text).not.toContain('現在値');
    expect(text).not.toContain('終値');
    expect(text).not.toContain('基準価額');
  });

});
