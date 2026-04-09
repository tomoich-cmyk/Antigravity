package com.antigravity.app.widget

import com.antigravity.contract.FreshnessLevel

/**
 * ウィジェット UI 状態。WidgetStateMapper が Room データから構築する。
 *
 * Small (2×1):  summaryLine + lastSyncAt + isFailure/isFallback
 * Medium (4×1): quoteRows (最大3件) + isFailure/isFallback ヘッダー
 *
 * Glance は更新のたびに GlanceAppWidget が再生成されるため、
 * 状態はこのオブジェクトとして provideGlance 内で構築し直す。
 * Room が正本 — Glance state は持たない。
 */
data class WidgetUiState(
    /** Small: 要約テキスト1行 / エラー時 "取得エラー" / 空 DB "データなし" */
    val summaryLine: String,
    /** Small: 最終同期成功時刻 (ISO-8601 JST)。null = 未同期 */
    val lastSyncAt: String? = null,
    val isFailure: Boolean = false,
    val isFallback: Boolean = false,
    /** Medium: 主要資産 (最大3件) */
    val quoteRows: List<WidgetQuoteRow> = emptyList(),
)

/**
 * 1 資産分のウィジェット表示データ。
 * FreshnessEvaluator の結果を WidgetStateMapper で変換済み。
 */
data class WidgetQuoteRow(
    val displayName: String,
    val price: String,           // "%,d円" フォーマット済み
    val timeLabel: String,       // "現在値" (canPretendCurrent=true のみ) or asOfLabel
    val freshnessLevel: FreshnessLevel,
)
