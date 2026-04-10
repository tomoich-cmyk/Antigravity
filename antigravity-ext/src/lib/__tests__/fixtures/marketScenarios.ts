/**
 * fixtures/marketScenarios.ts
 *
 * freshness / summaryText / generateSummary / 将来の E2E で共通利用できる
 * 市場シナリオ定義。
 *
 * ─── 日時の前提 ──────────────────────────────────────────────────────────────
 *   2026-04-06 (月)  ← today / 前場・大引け基準日
 *   2026-04-03 (金)  ← prevBizDay (前営業日)
 *
 * ─── シナリオ一覧 ─────────────────────────────────────────────────────────────
 *   weekdayMorningCloseNav   平日朝 08:30 JST — close + nav (前営業日終値 / 基準価額)
 *   intradayFresh            平日前場 10:00 JST — intraday 10 分前 (現在値)
 *   intradayLagging          平日前場 10:40 JST — intraday 30 分前 (やや遅延)
 *   staleWithCandidateBlock  平日前場 09:30 JST — stale 混在 + market_context_missing
 *   mixedNoCurrentLeak       平日前場 09:30 JST — close/nav/reference 混在 (現在値ゼロ)
 *
 * ─── 使い方 ──────────────────────────────────────────────────────────────────
 *   import { scenarios } from './fixtures/marketScenarios';
 *
 *   const { now, quotes } = scenarios.intradayFresh;
 *   const text = generateSummaryText({ quotes, now });
 *   expect(text).toContain(scenarios.intradayFresh.expectedFragments.present);
 */

import type { QuoteSnapshot } from '../../../types/market';
import type { CandidateBlockReason } from '../../summaryText';

// ─── 基準日定数 ───────────────────────────────────────────────────────────────

/** 2026-04-06 (月) */
export const TODAY = '2026-04-06';
/** 前営業日 = 2026-04-03 (金) */
export const PREV_BIZ = '2026-04-03';

// ─── QuoteSnapshot ファクトリ ─────────────────────────────────────────────────

export function makeStock(partial: Partial<QuoteSnapshot> = {}): QuoteSnapshot {
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

export function makeFund(partial: Partial<QuoteSnapshot> = {}): QuoteSnapshot {
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

// ─── シナリオ型 ───────────────────────────────────────────────────────────────

export interface MarketScenario {
  /** 判定基準時刻 (ISO 9+09:00) */
  now: string;
  /** テスト対象の QuoteSnapshot 配列 */
  quotes: QuoteSnapshot[];
  /** 候補ブロック理由 (なければ undefined) */
  candidateBlockReason?: CandidateBlockReason;
  /** テストで確認すべき断片キーワード */
  expectedFragments: {
    /** 必ず含む断片 */
    include: string[];
    /** 決して含まない断片 */
    exclude: string[];
  };
}

// ─── シナリオ定義 ─────────────────────────────────────────────────────────────

/**
 * S1: 平日朝 08:30 (pre_open)
 * GMOPG: close, baselineDate=4/3 → diff=1 → fresh, "4/3 終値"
 * AB:    nav,   baselineDate=4/3 → diff=1 → fresh, "4/3 基準価額"
 */
export const weekdayMorningCloseNav: MarketScenario = {
  now: `${TODAY}T08:30:00+09:00`,
  quotes: [
    makeStock({ quoteKind: 'close', baselineDate: PREV_BIZ }),
    makeFund({ quoteKind: 'nav',   baselineDate: PREV_BIZ }),
  ],
  expectedFragments: {
    include: ['終値', '基準価額'],
    exclude: ['現在値', 'やや遅延', '更新注意'],
  },
};

/**
 * S2: 場中 fresh 10:00 (前場)
 * GMOPG: intraday, marketDataAt=09:50 (10分前) → fresh, canPretendCurrent=true, "現在値"
 */
export const intradayFresh: MarketScenario = {
  now: `${TODAY}T10:00:00+09:00`,
  quotes: [
    makeStock({
      quoteKind:    'intraday',
      baselineDate: TODAY,
      marketDataAt: `${TODAY}T09:50:00+09:00`,
      value:        9920,
    }),
  ],
  expectedFragments: {
    include: ['現在値'],
    exclude: ['終値', '基準価額', 'やや遅延', '更新注意'],
  },
};

/**
 * S3: 場中 lagging 10:40 (前場)
 * GMOPG: intraday, marketDataAt=10:10 (30分前) → lagging, canPretendCurrent=false, "やや遅延"
 */
export const intradayLagging: MarketScenario = {
  now: `${TODAY}T10:40:00+09:00`,
  quotes: [
    makeStock({
      quoteKind:    'intraday',
      baselineDate: TODAY,
      marketDataAt: `${TODAY}T10:10:00+09:00`,
      value:        9870,
    }),
  ],
  expectedFragments: {
    include: ['時点', 'やや遅延'],
    exclude: ['現在値', '更新注意'],
  },
};

/**
 * S4: stale 混在 + market_context_missing 09:30 (前場)
 * GMOPG: intraday, baselineDate=4/3 → dataYmd < today → stale, "更新注意"
 * AB:    nav,      baselineDate=4/3 → diff=1 → fresh, "基準価額"
 * candidateBlockReason: 'market_context_missing'
 */
export const staleWithCandidateBlock: MarketScenario = {
  now: `${TODAY}T09:30:00+09:00`,
  quotes: [
    makeStock({
      quoteKind:    'intraday',
      baselineDate: PREV_BIZ,
      marketDataAt: `${PREV_BIZ}T10:00:00+09:00`,
      value:        9800,
    }),
    makeFund({ quoteKind: 'nav', baselineDate: PREV_BIZ }),
  ],
  candidateBlockReason: 'market_context_missing',
  expectedFragments: {
    include: ['更新注意', '基準価額', '市場コンテキスト未同期'],
    exclude: ['現在値'],
  },
};

/**
 * S5: close + nav + reference 混在 — 現在値ゼロ確認 09:30 (前場)
 * 全資産 canPretendCurrent=false → "現在値" が一切出ない
 */
export const mixedNoCurrentLeak: MarketScenario = {
  now: `${TODAY}T09:30:00+09:00`,
  quotes: [
    makeStock({ assetId: 'GMOPG',  quoteKind: 'close',     baselineDate: PREV_BIZ }),
    makeFund({  assetId: 'AB',     quoteKind: 'nav',       baselineDate: PREV_BIZ }),
    makeFund({  assetId: 'REF',    quoteKind: 'reference', baselineDate: PREV_BIZ }),
  ],
  expectedFragments: {
    include: ['終値', '基準価額', '参考'],
    exclude: ['現在値'],
  },
};

// ─── エクスポート ─────────────────────────────────────────────────────────────

export const scenarios = {
  weekdayMorningCloseNav,
  intradayFresh,
  intradayLagging,
  staleWithCandidateBlock,
  mixedNoCurrentLeak,
} as const;
