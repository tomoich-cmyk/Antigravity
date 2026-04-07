package com.antigravity.engine

import com.antigravity.contract.*
import java.time.ZonedDateTime

/**
 * 通知・Widget 用テキスト生成 — Web 側 summaryText.ts の Kotlin 移植。
 *
 * 出力例:
 *   "GMOPG: 現在値 9,920円"
 *   "GMOPG: 4/6 10:10時点 9,870円（やや遅延）"
 *   "GMOPG: 4/3 終値 9,850円"
 *   "AB: 4/3 基準価額 9,117円"
 *   "GMOPG: 4/3 前営業日 9,800円（更新注意）"
 */
object SummaryTextBuilder {

    // ─── buildQuoteSummaryLine ────────────────────────────────────────────────
    /**
     * 1 資産分の価格サマリー行を返す。
     *
     * ルール (Web と同一):
     *   - canPretendCurrent=true のときだけ "現在値" (priceLabel を使う)
     *   - それ以外は asOfLabel を使う ("終値"/"基準価額"/"参考" を含む)
     *   - lagging → "（やや遅延）" を末尾に追加
     *   - stale   → "（更新注意）" を末尾に追加
     */
    fun buildQuoteSummaryLine(
        quote: QuoteSnapshot,
        now: ZonedDateTime = ZonedDateTime.now(MarketClock.JST),
        isHoliday: (String) -> Boolean = JapanHolidayProvider,
    ): String {
        val fv = FreshnessEvaluator.evaluate(quote, now, isHoliday)

        val timeLabel = if (fv.canPretendCurrent) {
            fv.priceLabel  // "現在値"
        } else {
            // asOfLabel 末尾の " (遅延)" は suffix で表現するため除去
            fv.asOfLabel.removeSuffix(" (遅延)")
        }

        val suffix = when {
            fv.level == FreshnessLevel.LAGGING -> "（やや遅延）"
            fv.isStale                         -> "（更新注意）"
            else                               -> ""
        }

        val price = "%,d円".format(quote.value.toLong())
        return "${quote.assetId}: $timeLabel $price$suffix"
    }

    // ─── buildFetchStatusText ─────────────────────────────────────────────────
    /**
     * fetch 失敗状態を 1 行に変換する。
     * 成功 / idle → 空文字 (状態行なし)。
     *
     * Web 側と同一ルール:
     *   - status=IDLE / SUCCESS → ""
     *   - status=FAILED, lastSuccessAt=null → 初回取得前
     *   - status=FAILED, lastSuccessAt!=null → 前回取得分を表示
     */
    fun buildFetchStatusText(fetchStatus: SnapshotFetchState): String {
        if (fetchStatus.status != SnapshotFetchState.FetchStatus.FAILED) return ""
        return if (fetchStatus.lastSuccessAt == null) {
            "市場データを取得できませんでした（初回取得前）。"
        } else {
            "市場データの更新に失敗したため、前回取得分を表示しています。"
        }
    }

    // ─── generateSummaryText ─────────────────────────────────────────────────
    /**
     * 複数資産の価格サマリーと候補理由を改行区切りで結合する。
     *
     * 出力構造:
     *   <価格行 1 件につき 1 行>
     *   [失敗状態行] ← status=FAILED のときのみ
     *   [候補理由行] ← candidateBlockReason があるときのみ
     */
    fun generateSummaryText(
        quotes: List<QuoteSnapshot>,
        now: ZonedDateTime = ZonedDateTime.now(MarketClock.JST),
        fetchStatus: SnapshotFetchState? = null,
        candidateBlockReason: CandidateBlockReason? = null,
        isHoliday: (String) -> Boolean = JapanHolidayProvider,
    ): String {
        val lines = mutableListOf<String>()

        for (q in quotes) {
            lines += buildQuoteSummaryLine(q, now, isHoliday)
        }

        fetchStatus?.let {
            val statusText = buildFetchStatusText(it)
            if (statusText.isNotEmpty()) lines += statusText
        }

        candidateBlockReason?.let {
            lines += CandidateReasonTextBuilder.build(it)
        }

        return lines.joinToString("\n")
    }
}
