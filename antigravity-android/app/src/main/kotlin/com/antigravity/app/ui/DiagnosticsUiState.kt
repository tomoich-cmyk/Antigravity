package com.antigravity.app.ui

import com.antigravity.contract.FreshnessLevel

/**
 * 診断画面の UI 状態。DiagnosticsViewModel が Room データから構築する。
 *
 * 表示内容:
 *   - 同期状態カード: fetch_status の全フィールド
 *   - 資産詳細カード (per asset): quoteKind / baselineDate / timeLabel / freshnessLevel
 *
 * 目的: "Widget / 通知が何を元に表示しているか" を 1 画面で把握できるようにする。
 * 開発・運用時の runbook 代わりに使う。
 */
data class DiagnosticsUiState(
    val isLoading: Boolean = true,

    // ─── fetch_status ────────────────────────────────────────────────────────
    val fetchStatusLabel: String = "---",      // SUCCESS / FAILED / IDLE
    val lastSyncAt: String? = null,            // 最終成功時刻 (formatSyncTime 済み or raw)
    val lastAttemptAt: String? = null,         // 前回試行時刻
    val fallbackUsed: Boolean = false,         // 前回値継続表示中か
    val errorKind: String? = null,             // NETWORK / TIMEOUT / HTTP etc.
    val errorMessage: String? = null,          // 生エラーメッセージ

    // ─── 資産詳細 ─────────────────────────────────────────────────────────────
    val quoteRows: List<DiagnosticsQuoteRow> = emptyList(),
)

/**
 * 1 資産分の診断情報。FreshnessEvaluator の結果を変換済み。
 */
data class DiagnosticsQuoteRow(
    val assetId: String,
    val displayName: String,
    val quoteKind: String,           // INTRADAY / CLOSE / NAV / REFERENCE
    val baselineDate: String,        // "yyyy-MM-dd"
    val syncedAt: String,            // 同期時刻 (ISO-8601)
    val marketDataAt: String?,       // 価格成立時刻 (null = 不明)
    val timeLabel: String,           // "現在値" or asOfLabel
    val freshnessLevel: FreshnessLevel,
    val canPretendCurrent: Boolean,
)
