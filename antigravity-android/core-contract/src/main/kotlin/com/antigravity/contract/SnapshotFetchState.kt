package com.antigravity.contract

/**
 * フェッチ状態 — Web 側 SnapshotFetchState の Kotlin 移植。
 *
 * 不変条件:
 *   - status=idle / success → 状態行なし
 *   - status=failed のみ → 状態行あり
 *   - fetch 失敗時は価格を書き換えない (fallbackUsed=true は「前回値を継続表示中」)
 */
data class SnapshotFetchState(
    val sourceId: SourceId = SourceId.SNAPSHOT_SERVER,
    val status: FetchStatus,
    val lastAttemptAt: String? = null,
    val lastSuccessAt: String? = null,
    val lastErrorAt: String? = null,
    val errorKind: SnapshotFetchErrorKind? = null,
    val errorMessage: String? = null,
    val fallbackUsed: Boolean = false,
    val hasUsableCachedQuotes: Boolean = false,
) {
    enum class FetchStatus { IDLE, SUCCESS, FAILED }

    companion object {
        val IDLE = SnapshotFetchState(status = FetchStatus.IDLE)
    }
}
