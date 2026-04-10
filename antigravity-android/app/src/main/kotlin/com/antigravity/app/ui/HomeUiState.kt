package com.antigravity.app.ui

import com.antigravity.contract.FreshnessLevel
import com.antigravity.contract.SnapshotFetchState

/**
 * Home 画面の UI 状態。ViewModel が Room データから構築して emit する。
 *
 * 不変条件:
 *   - isLoading=true の間は quoteRows は空
 *   - isFallback=true のとき fetchStatus.fallbackUsed=true (前回値を継続表示中)
 *   - isFailure=true のとき status=FAILED (fallback と独立して評価する)
 */
data class HomeUiState(
    val quoteRows: List<QuoteRowData> = emptyList(),
    val fetchStatus: SnapshotFetchState? = null,
    val lastSyncAt: String? = null,
    val isLoading: Boolean = true,
    /** Pull-to-Refresh インジケーター用。初期ロード(isLoading)とは独立して管理する。 */
    val isRefreshing: Boolean = false,
    /** summary_cache の最新テキスト (通知・Widget と同じ内容) */
    val summaryText: String? = null,
) {
    val isEmpty: Boolean
        get() = !isLoading && quoteRows.isEmpty()

    val isFallback: Boolean
        get() = fetchStatus?.fallbackUsed == true

    val isFailure: Boolean
        get() = fetchStatus?.status == SnapshotFetchState.FetchStatus.FAILED
}

/**
 * 1 資産分の表示データ。FreshnessEvaluator の結果を UI 向けに変換済み。
 *
 * 不変条件:
 *   - canPretendCurrent=true のときのみ timeLabel="現在値"
 *   - それ以外は asOfLabel ("4/5 終値" 等) を使う
 */
data class QuoteRowData(
    val assetId: String,
    val displayName: String,
    val price: String,                  // "%,d円" フォーマット済み
    val timeLabel: String,              // "現在値" or asOfLabel
    val freshnessLevel: FreshnessLevel,
    val canPretendCurrent: Boolean,
    /** 前日比テキスト例: "+2.34%" / "-1.23%" / null=不明 */
    val changeText: String? = null,
    /** 前日比が正なら true、負なら false、不明なら null */
    val changePositive: Boolean? = null,
)
