/**
 * notificationSmoke.test.ts
 *
 * 通知 E2E スモークテスト。
 *
 * 対象経路:
 *   QuoteSnapshot[] (adapter 相当) → evaluateFreshness → buildQuoteSummaryLine
 *   → generateSummaryText → 最終通知文字列
 *
 * ユニットテストでは個々の部品を確認済み。
 * このテストでは「全部つないでも壊れない」「wiring バグが出ない」を固定する。
 *
 * シナリオ:
 *   Smoke1: 平日朝 — close + nav (前営業日終値 / 基準価額)
 *   Smoke2: 場中 fresh — intraday 10 分前 (現在値)
 *   Smoke3: 場中 lagging — intraday 30 分前 (やや遅延)
 *   Smoke4: stale + market_context_missing
 *   Smoke5: fetch failure + fallback (close/nav 保持)
 *
 * 受け入れ条件:
 *   - 最終文字列まで通して検証できる
 *   - 現在値 が fresh intraday にしか出ない
 *   - fetch failure 時に 前回取得分を表示 が出る
 *   - fallback 時に 現在値 が混入しない
 *   - 各行の順序が「価格 → 状態 → 候補理由」
 */

import { describe, it, expect } from 'vitest';
import { generateSummaryText } from '../summaryText';
import type { SnapshotFetchState } from '../../types/fetchStatus';
import {
  scenarios,
  makeStock,
  makeFund,
  TODAY,
  PREV_BIZ,
} from './fixtures/marketScenarios';

// ─── 共通: 失敗 fetchStatus ───────────────────────────────────────────────────

const fetchFailed: SnapshotFetchState = {
  status: 'failed',
  errorKind: 'network',
  fallbackUsed: true,
  lastAttemptAt:  `${TODAY}T09:25:00+09:00`,
  lastSuccessAt:  `${TODAY}T09:00:00+09:00`,
  lastErrorAt:    `${TODAY}T09:25:00+09:00`,
};

const fetchSuccess: SnapshotFetchState = {
  status: 'success',
  fallbackUsed: false,
  lastSuccessAt: `${TODAY}T09:00:00+09:00`,
};

// ─── Smoke1: 平日朝 ───────────────────────────────────────────────────────────

describe('Smoke1: 平日朝 — close + nav', () => {
  const { now, quotes } = scenarios.weekdayMorningCloseNav;

  it('パイプライン通過: 例外が出ない', () => {
    expect(() => generateSummaryText({ quotes, now, fetchStatus: fetchSuccess })).not.toThrow();
  });

  it('GMOPG 終値 / AB 基準価額 が 1 行ずつ出る', () => {
    const text = generateSummaryText({ quotes, now, fetchStatus: fetchSuccess });
    const lines = text.split('\n');

    expect(lines.some(l => l.startsWith('GMOPG:') && l.includes('終値'))).toBe(true);
    expect(lines.some(l => l.startsWith('AB:')    && l.includes('基準価額'))).toBe(true);
  });

  it('現在値 が一切出ない', () => {
    const text = generateSummaryText({ quotes, now, fetchStatus: fetchSuccess });
    expect(text).not.toContain('現在値');
  });

  it('状態行が出ない (fetch 成功)', () => {
    const text = generateSummaryText({ quotes, now, fetchStatus: fetchSuccess });
    expect(text).not.toContain('前回取得分');
    expect(text).not.toContain('取得できません');
  });

  it('やや遅延 / 更新注意 が出ない', () => {
    const text = generateSummaryText({ quotes, now, fetchStatus: fetchSuccess });
    expect(text).not.toContain('やや遅延');
    expect(text).not.toContain('更新注意');
  });
});

// ─── Smoke2: 場中 fresh ───────────────────────────────────────────────────────

describe('Smoke2: 場中 fresh — intraday 10 分前', () => {
  const { now, quotes } = scenarios.intradayFresh;

  it('パイプライン通過: 例外が出ない', () => {
    expect(() => generateSummaryText({ quotes, now, fetchStatus: fetchSuccess })).not.toThrow();
  });

  it('GMOPG 現在値 が出る', () => {
    const text = generateSummaryText({ quotes, now, fetchStatus: fetchSuccess });
    const lines = text.split('\n');
    expect(lines.some(l => l.startsWith('GMOPG:') && l.includes('現在値'))).toBe(true);
  });

  it('終値 / 基準価額 / やや遅延 / 更新注意 が出ない', () => {
    const text = generateSummaryText({ quotes, now, fetchStatus: fetchSuccess });
    expect(text).not.toContain('終値');
    expect(text).not.toContain('基準価額');
    expect(text).not.toContain('やや遅延');
    expect(text).not.toContain('更新注意');
  });

  it('価格行は 1 行のみ (余計な行なし)', () => {
    const text = generateSummaryText({ quotes, now, fetchStatus: fetchSuccess });
    expect(text.split('\n')).toHaveLength(1);
  });
});

// ─── Smoke3: 場中 lagging ────────────────────────────────────────────────────

describe('Smoke3: 場中 lagging — intraday 30 分前', () => {
  const { now, quotes } = scenarios.intradayLagging;

  it('パイプライン通過: 例外が出ない', () => {
    expect(() => generateSummaryText({ quotes, now, fetchStatus: fetchSuccess })).not.toThrow();
  });

  it('GMOPG やや遅延 が出る', () => {
    const text = generateSummaryText({ quotes, now, fetchStatus: fetchSuccess });
    const lines = text.split('\n');
    expect(lines.some(l => l.startsWith('GMOPG:') && l.includes('やや遅延'))).toBe(true);
  });

  it('現在値 が出ない', () => {
    const text = generateSummaryText({ quotes, now, fetchStatus: fetchSuccess });
    expect(text).not.toContain('現在値');
  });

  it('時点 が出る (asOfLabel hh:mm時点)', () => {
    const text = generateSummaryText({ quotes, now, fetchStatus: fetchSuccess });
    expect(text).toContain('時点');
  });

  it('更新注意 が出ない (stale ではなく lagging)', () => {
    const text = generateSummaryText({ quotes, now, fetchStatus: fetchSuccess });
    expect(text).not.toContain('更新注意');
  });
});

// ─── Smoke4: stale + market_context_missing ──────────────────────────────────

describe('Smoke4: stale + market_context_missing', () => {
  const { now, quotes, candidateBlockReason } = scenarios.staleWithCandidateBlock;

  it('パイプライン通過: 例外が出ない', () => {
    expect(() =>
      generateSummaryText({ quotes, now, fetchStatus: fetchSuccess, candidateBlockReason })
    ).not.toThrow();
  });

  it('GMOPG 更新注意 / AB 基準価額 が出る', () => {
    const text = generateSummaryText({ quotes, now, fetchStatus: fetchSuccess, candidateBlockReason });
    const lines = text.split('\n');
    expect(lines.some(l => l.startsWith('GMOPG:') && l.includes('更新注意'))).toBe(true);
    expect(lines.some(l => l.startsWith('AB:')    && l.includes('基準価額'))).toBe(true);
  });

  it('市場コンテキスト未同期 が出る', () => {
    const text = generateSummaryText({ quotes, now, fetchStatus: fetchSuccess, candidateBlockReason });
    expect(text).toContain('市場コンテキスト未同期');
  });

  it('現在値 が一切出ない', () => {
    const text = generateSummaryText({ quotes, now, fetchStatus: fetchSuccess, candidateBlockReason });
    expect(text).not.toContain('現在値');
  });

  it('行の順序: 価格行 → 候補理由行', () => {
    const text = generateSummaryText({ quotes, now, fetchStatus: fetchSuccess, candidateBlockReason });
    const lines = text.split('\n');
    const priceLineIdx   = lines.findIndex(l => l.startsWith('GMOPG:'));
    const reasonLineIdx  = lines.findIndex(l => l.includes('市場コンテキスト未同期'));
    expect(priceLineIdx).toBeGreaterThanOrEqual(0);
    expect(reasonLineIdx).toBeGreaterThan(priceLineIdx);
  });
});

// ─── Smoke5: fetch failure + fallback ────────────────────────────────────────

describe('Smoke5: fetch failure + fallback (close/nav 保持)', () => {
  const { now, quotes } = scenarios.weekdayMorningCloseNav;

  it('パイプライン通過: 例外が出ない', () => {
    expect(() =>
      generateSummaryText({ quotes, now, fetchStatus: fetchFailed })
    ).not.toThrow();
  });

  it('価格行は引き続き出る (fallback = 前回成功値を表示継続)', () => {
    const text = generateSummaryText({ quotes, now, fetchStatus: fetchFailed });
    const lines = text.split('\n');
    expect(lines.some(l => l.startsWith('GMOPG:'))).toBe(true);
    expect(lines.some(l => l.startsWith('AB:'))).toBe(true);
  });

  it('前回取得分を表示 が出る', () => {
    const text = generateSummaryText({ quotes, now, fetchStatus: fetchFailed });
    expect(text).toContain('前回取得分を表示');
  });

  it('現在値 が出ない (fallback 中も close/nav → canPretendCurrent=false)', () => {
    const text = generateSummaryText({ quotes, now, fetchStatus: fetchFailed });
    expect(text).not.toContain('現在値');
  });

  it('行の順序: 価格行 → 状態行', () => {
    const text = generateSummaryText({ quotes, now, fetchStatus: fetchFailed });
    const lines = text.split('\n');
    const priceLineIdx  = lines.findIndex(l => l.startsWith('GMOPG:'));
    const statusLineIdx = lines.findIndex(l => l.includes('前回取得分を表示'));
    expect(priceLineIdx).toBeGreaterThanOrEqual(0);
    expect(statusLineIdx).toBeGreaterThan(priceLineIdx);
  });

  it('fetch failure + candidateBlockReason の行順: 価格 → 状態 → 候補理由', () => {
    const text = generateSummaryText({
      quotes,
      now,
      fetchStatus: fetchFailed,
      candidateBlockReason: 'market_context_missing',
    });
    const lines = text.split('\n');
    const priceIdx  = lines.findIndex(l => l.startsWith('GMOPG:'));
    const statusIdx = lines.findIndex(l => l.includes('前回取得分を表示'));
    const reasonIdx = lines.findIndex(l => l.includes('市場コンテキスト未同期'));

    expect(priceIdx).toBeGreaterThanOrEqual(0);
    expect(statusIdx).toBeGreaterThan(priceIdx);
    expect(reasonIdx).toBeGreaterThan(statusIdx);
  });
});

// ─── Smoke全体: 現在値 混入防止クロスチェック ─────────────────────────────────

describe('全シナリオ: 現在値 は fresh intraday にしか出ない', () => {
  it('Smoke1 (close+nav) に 現在値 なし', () => {
    const { now, quotes } = scenarios.weekdayMorningCloseNav;
    expect(generateSummaryText({ quotes, now })).not.toContain('現在値');
  });

  it('Smoke3 (lagging intraday) に 現在値 なし', () => {
    const { now, quotes } = scenarios.intradayLagging;
    expect(generateSummaryText({ quotes, now })).not.toContain('現在値');
  });

  it('Smoke4 (stale) に 現在値 なし', () => {
    const { now, quotes } = scenarios.staleWithCandidateBlock;
    expect(generateSummaryText({ quotes, now })).not.toContain('現在値');
  });

  it('Smoke5 (fetch failure) に 現在値 なし', () => {
    const { now, quotes } = scenarios.weekdayMorningCloseNav;
    expect(generateSummaryText({ quotes, now, fetchStatus: fetchFailed })).not.toContain('現在値');
  });

  it('Smoke2 (fresh intraday) だけに 現在値 が出る', () => {
    const { now, quotes } = scenarios.intradayFresh;
    expect(generateSummaryText({ quotes, now })).toContain('現在値');
  });
});

// ─── パイプライン wiring: adapter 相当の多資産混在 ───────────────────────────

describe('wiring: adapter 出力相当の多資産混在', () => {
  it('3 資産 × 異なる quoteKind が 1 テキストに正しく並ぶ', () => {
    // adapter が返す典型的な出力を模倣
    const quotes = [
      makeStock({
        assetId:      'GMOPG',
        quoteKind:    'intraday',
        baselineDate: TODAY,
        marketDataAt: `${TODAY}T09:50:00+09:00`,
        value:        9920,
      }),
      makeStock({
        assetId:      'U-NEXT',
        quoteKind:    'close',
        baselineDate: PREV_BIZ,
        value:        4210,
      }),
      makeFund({
        assetId:      'AB',
        quoteKind:    'nav',
        baselineDate: PREV_BIZ,
        value:        9117,
      }),
    ];
    const now = `${TODAY}T10:00:00+09:00`;
    const text = generateSummaryText({ quotes, now, fetchStatus: fetchSuccess });
    const lines = text.split('\n');

    // 3 行 (price × 3, 状態なし)
    expect(lines).toHaveLength(3);

    // GMOPG: 現在値 (10分前 → fresh)
    expect(lines[0]).toMatch(/^GMOPG:.*現在値/);

    // U-NEXT: 終値
    expect(lines[1]).toMatch(/^U-NEXT:.*終値/);
    expect(lines[1]).not.toContain('現在値');

    // AB: 基準価額
    expect(lines[2]).toMatch(/^AB:.*基準価額/);
    expect(lines[2]).not.toContain('現在値');
  });
});
