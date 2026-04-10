/**
 * freshnessAudit.ts
 *
 * 鮮度判定の監査ログ。
 * 通知がおかしいときにこのログを見れば
 * 「なぜ現在値にならなかったか」「なぜ更新注意になったか」が 1 行で分かる。
 *
 * 出力例:
 *   [freshness] assetId=GMOPG quoteKind=intraday baselineDate=2026-04-06
 *               marketDataAt=2026-04-06T09:50:00+09:00
 *               level=fresh canPretendCurrent=true priceLabel=現在値
 *
 * - console.debug を使用 (ブラウザの DevTools では Verbose レベル)
 * - Vitest 実行中は出力しない (VITEST 環境変数で判定)
 */

import type { FreshnessView, QuoteKind } from '../types/market';
import type { FetchErrorKind } from '../types/fetchStatus';

/**
 * ログ抑制フラグ。
 * - Vitest 実行中: import.meta.env.VITEST で判定 (Vite/Vitest 共通)
 * - 本番ビルド: import.meta.env.PROD で判定 (console.debug は本番でも出るが
 *   DevTools Verbose フィルタにしか表示されないため許容)
 *   → 完全に消したい場合は IS_PROD を条件に加える
 */
const IS_VITEST = !!import.meta.env['VITEST'];

/**
 * 鮮度判定結果を 1 行の debug ログとして出力する。
 * Vitest 実行中はサイレント。
 */
export function logFreshnessAudit(
  assetId:     string,
  quoteKind:   QuoteKind,
  baselineDate: string | undefined | null,
  marketDataAt: string | undefined | null,
  fv: FreshnessView,
): void {
  if (IS_VITEST) return;

  // marketDataAt は長い ISO 文字列なので hh:mm のみ抜粋
  const mdShort = marketDataAt
    ? (() => {
        const d = new Date(marketDataAt);
        return Number.isNaN(d.getTime())
          ? marketDataAt
          : `${d.toISOString().slice(0, 16).replace('T', ' ')}`;
      })()
    : '—';

  console.debug(
    '[freshness]',
    `assetId=${assetId}`,
    `quoteKind=${quoteKind}`,
    `baselineDate=${baselineDate ?? '—'}`,
    `marketDataAt=${mdShort}`,
    `level=${fv.level}`,
    `canPretendCurrent=${fv.canPretendCurrent}`,
    `priceLabel=${fv.priceLabel}`,
  );
}

/**
 * fetch 試行結果を 1 行の debug ログとして出力する。
 * Vitest 実行中はサイレント。
 *
 * 出力例 (失敗):
 *   [fetch] source=snapshot_server status=failed errorKind=timeout fallbackUsed=true
 * 出力例 (成功):
 *   [fetch] source=snapshot_server status=success quotes=2 fallbackUsed=false
 */
export function logFetchAudit(params: {
  status: 'success' | 'failed';
  errorKind?: FetchErrorKind;
  fallbackUsed: boolean;
  quotesApplied?: number;
  lastSuccessAt?: string;
}): void {
  if (IS_VITEST) return;

  const parts: string[] = [
    '[fetch]',
    'source=snapshot_server',
    `status=${params.status}`,
  ];

  if (params.status === 'failed') {
    parts.push(`errorKind=${params.errorKind ?? 'unknown'}`);
    if (params.lastSuccessAt) {
      parts.push(`lastSuccessAt=${params.lastSuccessAt.slice(0, 16).replace('T', ' ')}`);
    }
  } else {
    parts.push(`quotes=${params.quotesApplied ?? 0}`);
  }

  parts.push(`fallbackUsed=${params.fallbackUsed}`);

  console.debug(parts.join(' '));
}
