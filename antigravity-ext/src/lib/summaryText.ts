/**
 * summaryText.ts
 *
 * 通知・サマリー用の純粋テキスト生成ヘルパー。
 * storage に依存しない。generateSummary() (storage 版) からも利用される。
 *
 * エクスポート:
 *   buildQuoteSummaryLine    - 1 資産分の価格ラベル行を返す
 *   buildCandidateReasonText - 候補ブロック理由コードを日本語に変換
 *   generateSummaryText      - 複数資産 + 候補理由を 1 本のテキストに結合
 */

import { evaluateFreshness } from './freshness';
import type { QuoteSnapshot } from '../types/market';

// ─── buildQuoteSummaryLine ────────────────────────────────────────────────────

/**
 * 1 資産分の価格サマリー行を返す。
 *
 * 出力例:
 *   "GMOPG: 現在値 9,920円"
 *   "GMOPG: 4/6 10:10時点 9,870円（やや遅延）"
 *   "U-NEXT: 4/3 終値 4,210円"
 *   "AB: 4/3 基準価額 9,117円"
 *   "GMOPG: 4/3 前営業日 9,850円（更新注意）"
 *
 * ルール:
 *   - canPretendCurrent=true (場中 intraday 20分以内) のときだけ "現在値"
 *   - それ以外は asOfLabel をそのまま使う ("終値"/"基準価額"/"参考" を含む)
 *   - lagging → "（やや遅延）" を末尾に追加
 *   - stale   → "（更新注意）" を末尾に追加
 */
export function buildQuoteSummaryLine(
  quote: QuoteSnapshot,
  nowIso: string,
): string {
  const now = new Date(nowIso);
  const fv = evaluateFreshness({ quote, now });
  const price = quote.value.toLocaleString() + '円';

  let timeLabel: string;
  if (fv.canPretendCurrent) {
    timeLabel = fv.priceLabel; // "現在値"
  } else {
    // asOfLabel 末尾の "(遅延)" は suffix で表現するため除去
    timeLabel = fv.asOfLabel.replace(/\s*\(遅延\)$/, '');
  }

  let suffix = '';
  if (fv.level === 'lagging') suffix = '（やや遅延）';
  else if (fv.isStale)        suffix = '（更新注意）';

  return `${quote.assetId}: ${timeLabel} ${price}${suffix}`;
}

// ─── buildCandidateReasonText ─────────────────────────────────────────────────

export type CandidateBlockReason =
  | 'market_context_missing'
  | 'stale_market_data'
  | 'score_below_threshold';

/**
 * 候補ブロック理由コードを人が読める文言に変換する。
 *
 * 出力例:
 *   "市場コンテキスト未同期のため、買付候補は保守的に非表示です。"
 *   "価格鮮度が低いため、候補評価をスキップしました。"
 *   "閾値未達のため候補なし。"
 */
export function buildCandidateReasonText(reason: CandidateBlockReason): string {
  switch (reason) {
    case 'market_context_missing':
      return '市場コンテキスト未同期のため、買付候補は保守的に非表示です。';
    case 'stale_market_data':
      return '価格鮮度が低いため、候補評価をスキップしました。';
    case 'score_below_threshold':
      return '閾値未達のため候補なし。';
  }
}

// ─── generateSummaryText ─────────────────────────────────────────────────────

export interface GenerateSummaryTextInput {
  quotes: QuoteSnapshot[];
  /** 判定基準時刻 (ISO string)。省略時は Date.now() */
  now?: string;
  candidateBlockReason?: CandidateBlockReason;
}

/**
 * 複数資産の価格サマリーと候補理由を改行区切りの 1 本のテキストにまとめる。
 * storage に依存しない純粋関数。generateSummary() (storage 版) はこれを利用する。
 */
export function generateSummaryText(input: GenerateSummaryTextInput): string {
  const nowIso = input.now ?? new Date().toISOString();
  const lines: string[] = [];

  for (const q of input.quotes) {
    lines.push(buildQuoteSummaryLine(q, nowIso));
  }

  if (input.candidateBlockReason) {
    lines.push(buildCandidateReasonText(input.candidateBlockReason));
  }

  return lines.join('\n');
}
