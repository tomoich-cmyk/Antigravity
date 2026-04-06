/**
 * generateSummary.test.ts
 *
 * generateSummaryText() の準統合テスト。
 * 複数資産・複数 quoteKind・候補理由が混在しても
 * 各行の意味が崩れないことを検証する。
 *
 * テストケース一覧:
 *  1. 株・投信・候補理由混在でも 1 行ずつ意味が崩れない
 *  2. lagging intraday は asOfLabel ベースになる (現在値 にならない)
 *  3. canPretendCurrent=false の資産に 現在値 が混入しない
 *  4. candidateBlockReason なし → 理由行が出ない
 *  5. stale 資産が混在しても 更新注意 以外の行に影響しない
 *  6. reference は 参考 で出る
 */

import { describe, it, expect } from 'vitest';
import type { QuoteSnapshot } from '../../types/market';
import { generateSummaryText } from '../summaryText';

// ─── テスト用ファクトリ ────────────────────────────────────────────────────────

function q(partial: Partial<QuoteSnapshot>): QuoteSnapshot {
  return {
    assetId:      'GMOPG',
    assetClass:   'jp_stock',
    value:        9850,
    currency:     'JPY',
    quoteKind:    'close',
    source:       { id: 'snapshot_server', mode: 'eod', label: 'Snapshot Server' },
    syncedAt:     '2026-04-06T08:01:00+09:00',
    marketDataAt: '2026-04-03T15:30:00+09:00',
    baselineDate: '2026-04-03',
    ...partial,
  };
}

// ─── テスト ───────────────────────────────────────────────────────────────────

describe('generateSummaryText', () => {

  it('1. 株・投信・候補理由をまとめても 1 行ずつ意味が崩れない', () => {
    // 現在: 2026-04-06 (月) 09:30 JST (前場)
    // GMOPG: intraday 10 分前 → fresh, 現在値
    // U-NEXT: close, baselineDate=4/3 → stale (diff=2), 終値
    // AB: nav, baselineDate=4/3 → lagging (diff=2), 基準価額
    const quotes = [
      q({
        assetId:      'GMOPG',
        quoteKind:    'intraday',
        baselineDate: '2026-04-06',
        marketDataAt: '2026-04-06T09:20:00+09:00',
        value:        9920,
      }),
      q({
        assetId:      'U-NEXT',
        quoteKind:    'close',
        baselineDate: '2026-04-03',
        marketDataAt: '2026-04-03T15:30:00+09:00',
        value:        4210,
      }),
      q({
        assetId:      'AB',
        assetClass:   'mutual_fund',
        quoteKind:    'nav',
        baselineDate: '2026-04-03',
        marketDataAt: null,
        value:        9117,
        source: { id: 'broker_import', mode: 'daily_nav', label: 'Broker Import' },
      }),
    ];

    const text = generateSummaryText({
      quotes,
      now: '2026-04-06T09:30:00+09:00',
      candidateBlockReason: 'market_context_missing',
    });

    // GMOPG: 現在値 (fresh intraday)
    expect(text).toContain('GMOPG');
    expect(text).toContain('現在値');

    // U-NEXT: 終値 (close)、現在値 は出ない
    expect(text).toContain('U-NEXT');
    expect(text).toContain('終値');
    expect(text).not.toMatch(/U-NEXT.*現在値/);

    // AB: 基準価額 (nav)、現在値 は出ない
    expect(text).toContain('AB');
    expect(text).toContain('基準価額');
    expect(text).not.toMatch(/AB.*現在値/);

    // 候補理由
    expect(text).toContain('市場コンテキスト未同期');
  });

  it('2. lagging intraday は 現在値 にならず asOfLabel + やや遅延', () => {
    // 現在: 2026-04-06 (月) 10:40 JST
    // marketDataAt: 10:10 → 30 分前 → lagging
    const quotes = [
      q({
        assetId:      'GMOPG',
        quoteKind:    'intraday',
        baselineDate: '2026-04-06',
        marketDataAt: '2026-04-06T10:10:00+09:00',
        value:        9870,
      }),
    ];

    const text = generateSummaryText({
      quotes,
      now: '2026-04-06T10:40:00+09:00',
    });

    expect(text).not.toContain('現在値');
    expect(text).toContain('時点');    // asOfLabel に hh:mm時点 が入る
    expect(text).toContain('やや遅延');
  });

  it('3. canPretendCurrent=false の資産に 現在値 が混入しない', () => {
    // close / nav はどちらも canPretendCurrent=false
    const quotes = [
      q({
        assetId:      'U-NEXT',
        quoteKind:    'close',
        baselineDate: '2026-04-03',
      }),
      q({
        assetId:      'AB',
        assetClass:   'mutual_fund',
        quoteKind:    'nav',
        baselineDate: '2026-04-03',
        marketDataAt: null,
        source: { id: 'broker_import', mode: 'daily_nav', label: 'Broker Import' },
      }),
    ];

    const text = generateSummaryText({
      quotes,
      now: '2026-04-06T09:30:00+09:00',
    });

    expect(text).not.toMatch(/U-NEXT.*現在値/);
    expect(text).not.toMatch(/AB.*現在値/);
  });

  it('4. candidateBlockReason なし → 理由行が出ない', () => {
    const quotes = [
      q({
        assetId:      'GMOPG',
        quoteKind:    'intraday',
        baselineDate: '2026-04-06',
        marketDataAt: '2026-04-06T09:20:00+09:00',
        value:        9920,
      }),
    ];

    const text = generateSummaryText({
      quotes,
      now: '2026-04-06T09:30:00+09:00',
    });

    expect(text).not.toContain('未同期');
    expect(text).not.toContain('鮮度');
    expect(text).not.toContain('閾値');
    // 価格行だけ出る
    expect(text.split('\n')).toHaveLength(1);
  });

  it('5. stale 資産が 更新注意 を出しても他行には影響しない', () => {
    // GMOPG: stale (前日データ)
    // U-NEXT: fresh intraday (現在値)
    const quotes = [
      q({
        assetId:      'GMOPG',
        quoteKind:    'intraday',
        baselineDate: '2026-04-03',
        marketDataAt: '2026-04-03T10:00:00+09:00',
        value:        9800,
      }),
      q({
        assetId:      'U-NEXT',
        quoteKind:    'intraday',
        baselineDate: '2026-04-06',
        marketDataAt: '2026-04-06T09:20:00+09:00',
        value:        4210,
      }),
    ];

    const text = generateSummaryText({
      quotes,
      now: '2026-04-06T09:30:00+09:00',
    });

    // GMOPG 行: 更新注意
    expect(text).toMatch(/GMOPG.*更新注意/);

    // U-NEXT 行: 現在値 (stale の影響を受けない)
    expect(text).toMatch(/U-NEXT.*現在値/);
  });

  it('6. reference は 参考 で出る、現在値 は出ない', () => {
    // baselineDate: 2026-04-03 → diff=1 (前営業日=4/4金) or diff=2 (4/4,4/6月)
    // いずれにせよ reference は lagging
    const quotes = [
      q({
        assetId:      'AB',
        assetClass:   'mutual_fund',
        quoteKind:    'reference',
        baselineDate: '2026-04-03',
        marketDataAt: null,
        source: { id: 'broker_import', mode: 'daily_nav', label: 'Broker Import' },
      }),
    ];

    const text = generateSummaryText({
      quotes,
      now: '2026-04-06T09:30:00+09:00',
    });

    expect(text).toContain('参考');
    expect(text).not.toContain('現在値');
    expect(text).not.toContain('終値');
    expect(text).not.toContain('基準価額');
  });

});
