/**
 * summaryText.test.ts
 *
 * buildQuoteSummaryLine / buildCandidateReasonText の単体テスト。
 * シナリオ入力は fixtures/marketScenarios.ts で一元管理。
 */

import { describe, it, expect } from 'vitest';
import {
  buildQuoteSummaryLine,
  buildCandidateReasonText,
} from '../summaryText';
import {
  scenarios,
  makeStock,
  makeFund,
  PREV_BIZ,
} from './fixtures/marketScenarios';

// ─── buildQuoteSummaryLine ────────────────────────────────────────────────────

describe('buildQuoteSummaryLine', () => {

  it('1. 場中 10 分前の intraday は 現在値 として出る', () => {
    const { now, quotes } = scenarios.intradayFresh;
    const text = buildQuoteSummaryLine(quotes[0], now);

    expect(text).toContain('GMOPG');
    expect(text).toContain('現在値');
    expect(text).toContain('9,920円');
    expect(text).not.toContain('終値');
    expect(text).not.toContain('基準価額');
    expect(text).not.toContain('やや遅延');
    expect(text).not.toContain('更新注意');
  });

  it('2. 場中 30 分前の intraday は 現在値 にならず asOfLabel + やや遅延', () => {
    const { now, quotes } = scenarios.intradayLagging;
    const text = buildQuoteSummaryLine(quotes[0], now);

    expect(text).toContain('GMOPG');
    expect(text).not.toContain('現在値');
    expect(text).toContain('時点');
    expect(text).toContain('やや遅延');
    expect(text).not.toContain('更新注意');
  });

  it('3. close は 終値 で出る、現在値 は出ない', () => {
    const { now } = scenarios.weekdayMorningCloseNav;
    const q = makeStock({ quoteKind: 'close', baselineDate: PREV_BIZ });
    const text = buildQuoteSummaryLine(q, now);

    expect(text).toContain('終値');
    expect(text).not.toContain('現在値');
  });

  it('4. nav は 基準価額 で出る、現在値 は出ない', () => {
    const { now } = scenarios.weekdayMorningCloseNav;
    const q = makeFund({ quoteKind: 'nav', baselineDate: PREV_BIZ });
    const text = buildQuoteSummaryLine(q, now);

    expect(text).toContain('AB');
    expect(text).toContain('基準価額');
    expect(text).not.toContain('現在値');
  });

  it('5. 前営業日以前の intraday は 更新注意 が付く、現在値 は出ない', () => {
    const { now } = scenarios.staleWithCandidateBlock;
    const q = makeStock({
      quoteKind:    'intraday',
      baselineDate: PREV_BIZ,
      marketDataAt: `${PREV_BIZ}T10:00:00+09:00`,
    });
    const text = buildQuoteSummaryLine(q, now);

    expect(text).toContain('更新注意');
    expect(text).not.toContain('現在値');
  });

});

// ─── buildCandidateReasonText ─────────────────────────────────────────────────

describe('buildCandidateReasonText', () => {

  it('6. market_context_missing → 市場コンテキスト未同期', () => {
    expect(buildCandidateReasonText('market_context_missing'))
      .toContain('市場コンテキスト未同期');
  });

  it('7. stale_market_data → 価格鮮度', () => {
    expect(buildCandidateReasonText('stale_market_data'))
      .toContain('価格鮮度');
  });

  it('8. score_below_threshold → 閾値', () => {
    expect(buildCandidateReasonText('score_below_threshold'))
      .toContain('閾値');
  });

});
