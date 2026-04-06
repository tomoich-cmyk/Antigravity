/**
 * summaryText.test.ts
 *
 * buildQuoteSummaryLine / buildCandidateReasonText の単体テスト。
 *
 * テストケース一覧:
 *  1. [intraday fresh]   場中 10 分前 → "現在値" で出る
 *  2. [intraday lagging] 場中 30 分前 → "現在値" にならず asOfLabel + "やや遅延"
 *  3. [close]            前営業日終値 → "終値" で出る、"現在値" なし
 *  4. [nav]              前営業日基準価額 → "基準価額" で出る、"現在値" なし
 *  5. [intraday stale]   前営業日以前 → "更新注意" が付く、"現在値" なし
 *  6. [reason] market_context_missing → "市場コンテキスト未同期"
 *  7. [reason] stale_market_data      → "価格鮮度"
 *  8. [reason] score_below_threshold  → "閾値"
 */

import { describe, it, expect } from 'vitest';
import type { QuoteSnapshot } from '../../types/market';
import {
  buildQuoteSummaryLine,
  buildCandidateReasonText,
} from '../summaryText';

// ─── テスト用ファクトリ ────────────────────────────────────────────────────────

function makeQuote(partial: Partial<QuoteSnapshot>): QuoteSnapshot {
  return {
    assetId: 'GMOPG',
    assetClass: 'jp_stock',
    value: 9850,
    currency: 'JPY',
    quoteKind: 'close',
    source: { id: 'snapshot_server', mode: 'eod', label: 'Snapshot Server' },
    syncedAt:      '2026-04-06T08:01:00+09:00',
    marketDataAt:  '2026-04-03T15:30:00+09:00',
    baselineDate:  '2026-04-03',
    ...partial,
  };
}

// ─── buildQuoteSummaryLine ────────────────────────────────────────────────────

describe('buildQuoteSummaryLine', () => {

  it('1. 場中 10 分前の intraday は 現在値 として出る', () => {
    // 現在: 2026-04-06 (月) 09:25 JST (前場)
    // marketDataAt: 09:15 JST → 10 分前 → fresh, canPretendCurrent=true
    const quote = makeQuote({
      quoteKind:    'intraday',
      baselineDate: '2026-04-06',
      marketDataAt: '2026-04-06T09:15:00+09:00',
      value:        9900,
    });
    const text = buildQuoteSummaryLine(quote, '2026-04-06T09:25:00+09:00');

    expect(text).toContain('GMOPG');
    expect(text).toContain('現在値');
    expect(text).toContain('9,900円');
    expect(text).not.toContain('終値');
    expect(text).not.toContain('基準価額');
    expect(text).not.toContain('やや遅延');
    expect(text).not.toContain('更新注意');
  });

  it('2. 場中 30 分前の intraday は 現在値 にならず asOfLabel + やや遅延', () => {
    // 現在: 2026-04-06 (月) 10:40 JST (前場)
    // marketDataAt: 10:10 JST → 30 分前 → lagging (20〜60 分), canPretendCurrent=false
    const quote = makeQuote({
      quoteKind:    'intraday',
      baselineDate: '2026-04-06',
      marketDataAt: '2026-04-06T10:10:00+09:00',
      value:        9870,
    });
    const text = buildQuoteSummaryLine(quote, '2026-04-06T10:40:00+09:00');

    expect(text).toContain('GMOPG');
    expect(text).not.toContain('現在値');
    expect(text).toContain('時点');   // asOfLabel に "hh:mm時点" が入る
    expect(text).toContain('やや遅延');
    expect(text).not.toContain('更新注意');
  });

  it('3. close は 終値 で出る、現在値 は出ない', () => {
    // 現在: 2026-04-06 (月) 08:10 JST (pre_open)
    // baselineDate: 2026-04-03 (Thu) → diff=2 → stale
    // asOfLabel = "4/3 終値" が含まれる
    const quote = makeQuote({
      quoteKind:    'close',
      baselineDate: '2026-04-03',
      marketDataAt: '2026-04-03T15:30:00+09:00',
      value:        9800,
    });
    const text = buildQuoteSummaryLine(quote, '2026-04-06T08:10:00+09:00');

    expect(text).toContain('終値');
    expect(text).not.toContain('現在値');
  });

  it('4. nav は 基準価額 で出る、現在値 は出ない', () => {
    // 現在: 2026-04-06 (月) 08:10 JST
    // baselineDate: 2026-04-03 → diff=2 → lagging (holiday_gap)
    // asOfLabel = "4/3 基準価額"
    const quote = makeQuote({
      assetId:      'AB',
      assetClass:   'mutual_fund',
      quoteKind:    'nav',
      baselineDate: '2026-04-03',
      marketDataAt: null,
      value:        9117,
      source: { id: 'broker_import', mode: 'daily_nav', label: 'Broker Import' },
    });
    const text = buildQuoteSummaryLine(quote, '2026-04-06T08:10:00+09:00');

    expect(text).toContain('AB');
    expect(text).toContain('基準価額');
    expect(text).not.toContain('現在値');
  });

  it('5. 前営業日以前の intraday は 更新注意 が付く、現在値 は出ない', () => {
    // 現在: 2026-04-06 (月) 13:00 JST (後場)
    // marketDataAt: 2026-04-03 (Thu) → dataYmd < todayYmd → stale
    const quote = makeQuote({
      quoteKind:    'intraday',
      baselineDate: '2026-04-03',
      marketDataAt: '2026-04-03T10:00:00+09:00',
      value:        9850,
    });
    const text = buildQuoteSummaryLine(quote, '2026-04-06T13:00:00+09:00');

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
