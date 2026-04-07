/**
 * fetchFallback.test.ts
 *
 * 取得失敗時の縮退運転テスト。
 * fetchStatusStore / summaryText の失敗経路を検証する。
 *
 * テストケース一覧:
 *  1. network error → status=failed, errorKind=network, fallbackUsed=true
 *  2. timeout → status=failed, errorKind=timeout
 *  3. adapter error → status=failed, errorKind=adapter_error
 *  4. empty snapshot → status=failed, errorKind=empty_snapshot
 *  5. fallback summary — 前回取得分 文言が出る
 *  6. fallback summary — 初回取得前の空状態
 *  7. fallback 中に 現在値 が出ない
 *  8. fetch 失敗 + candidateBlockReason の併記
 *  9. fetch 成功 → 状態行が出ない
 * 10. fetch 失敗でも price 行は既存ルールを維持する
 */

import { describe, it, expect } from 'vitest';
import type { SnapshotFetchState } from '../../types/fetchStatus';
import { generateSummaryText, buildFetchStatusText } from '../summaryText';
import {
  scenarios,
  makeStock,
  makeFund,
  TODAY,
  PREV_BIZ,
} from './fixtures/marketScenarios';

// ─── buildFetchStatusText ─────────────────────────────────────────────────────

describe('buildFetchStatusText', () => {

  it('1. network error → 前回取得分を表示 文言', () => {
    const fs: SnapshotFetchState = {
      status: 'failed',
      errorKind: 'network',
      fallbackUsed: true,
      lastSuccessAt: `${TODAY}T09:00:00+09:00`,
    };
    expect(buildFetchStatusText(fs)).toContain('前回取得分を表示');
  });

  it('2. timeout → 前回取得分を表示 文言', () => {
    const fs: SnapshotFetchState = {
      status: 'failed',
      errorKind: 'timeout',
      fallbackUsed: true,
      lastSuccessAt: `${TODAY}T09:00:00+09:00`,
    };
    expect(buildFetchStatusText(fs)).toContain('前回取得分を表示');
  });

  it('3. adapter_error → 前回取得分を表示 文言', () => {
    const fs: SnapshotFetchState = {
      status: 'failed',
      errorKind: 'adapter_error',
      fallbackUsed: true,
      lastSuccessAt: `${TODAY}T09:00:00+09:00`,
    };
    expect(buildFetchStatusText(fs)).toContain('前回取得分を表示');
  });

  it('4. empty_snapshot → 前回取得分を表示 文言', () => {
    const fs: SnapshotFetchState = {
      status: 'failed',
      errorKind: 'empty_snapshot',
      fallbackUsed: true,
      lastSuccessAt: `${TODAY}T09:00:00+09:00`,
    };
    expect(buildFetchStatusText(fs)).toContain('前回取得分を表示');
  });

  it('6. lastSuccessAt なし (初回起動前) → 初回取得前 文言', () => {
    const fs: SnapshotFetchState = {
      status: 'failed',
      errorKind: 'network',
      fallbackUsed: true,
      // lastSuccessAt なし
    };
    expect(buildFetchStatusText(fs)).toContain('初回取得前');
  });

  it('9. fetch 成功 → 空文字を返す (状態行なし)', () => {
    const fs: SnapshotFetchState = {
      status: 'success',
      fallbackUsed: false,
      lastSuccessAt: `${TODAY}T09:00:00+09:00`,
    };
    expect(buildFetchStatusText(fs)).toBe('');
  });

  it('idle (未試行) → 空文字を返す (状態行なし)', () => {
    const fs: SnapshotFetchState = {
      status: 'idle',
      fallbackUsed: false,
    };
    expect(buildFetchStatusText(fs)).toBe('');
  });

});

// ─── generateSummaryText + fetchStatus ────────────────────────────────────────

describe('generateSummaryText — fetch 失敗シナリオ', () => {

  const failedStatus: SnapshotFetchState = {
    status: 'failed',
    errorKind: 'network',
    fallbackUsed: true,
    lastSuccessAt: `${TODAY}T09:00:00+09:00`,
  };

  it('5. fallback summary — 前回取得分 文言が price 行の後に出る', () => {
    const { now, quotes } = scenarios.weekdayMorningCloseNav;
    const text = generateSummaryText({ quotes, now, fetchStatus: failedStatus });

    expect(text).toContain('終値');
    expect(text).toContain('前回取得分を表示');
  });

  it('7. fallback 中に 現在値 が出ない (stale close/nav のケース)', () => {
    const { now, quotes } = scenarios.weekdayMorningCloseNav;
    const text = generateSummaryText({ quotes, now, fetchStatus: failedStatus });

    expect(text).not.toContain('現在値');
  });

  it('8. fetch 失敗 + candidateBlockReason が自然に併記される', () => {
    const { now, quotes } = scenarios.weekdayMorningCloseNav;
    const text = generateSummaryText({
      quotes,
      now,
      fetchStatus: failedStatus,
      candidateBlockReason: 'market_context_missing',
    });

    // 価格行
    expect(text).toContain('終値');
    // 状態行
    expect(text).toContain('前回取得分を表示');
    // 候補理由行
    expect(text).toContain('市場コンテキスト未同期');
    // 3 セクションが分かれている
    const lines = text.split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  it('10. fetch 失敗でも price 行のラベルは鮮度ルールを維持する (close → 終値)', () => {
    // close の前営業日終値 → fresh, priceLabel="終値" のまま
    const q = makeStock({ quoteKind: 'close', baselineDate: PREV_BIZ });
    const text = generateSummaryText({
      quotes: [q],
      now: `${TODAY}T08:30:00+09:00`,
      fetchStatus: failedStatus,
    });

    expect(text).toContain('終値');
    expect(text).not.toContain('現在値');
  });

  it('fallback 中でも intraday stale は 更新注意 を維持する', () => {
    const q = makeStock({
      quoteKind:    'intraday',
      baselineDate: PREV_BIZ,
      marketDataAt: `${PREV_BIZ}T10:00:00+09:00`,
    });
    const text = generateSummaryText({
      quotes: [q],
      now: `${TODAY}T09:30:00+09:00`,
      fetchStatus: failedStatus,
    });

    expect(text).toContain('更新注意');
    expect(text).toContain('前回取得分を表示');
    expect(text).not.toContain('現在値');
  });

  it('fetch 成功 → 状態行が出ない', () => {
    const successStatus: SnapshotFetchState = {
      status: 'success',
      fallbackUsed: false,
      lastSuccessAt: `${TODAY}T09:00:00+09:00`,
    };
    const { now, quotes } = scenarios.weekdayMorningCloseNav;
    const text = generateSummaryText({ quotes, now, fetchStatus: successStatus });

    expect(text).not.toContain('前回取得分');
    expect(text).not.toContain('取得できません');
  });

  it('fetchStatus 未指定 → 状態行が出ない (既存互換)', () => {
    const { now, quotes } = scenarios.weekdayMorningCloseNav;
    const text = generateSummaryText({ quotes, now });

    expect(text).not.toContain('前回取得分');
  });

});
