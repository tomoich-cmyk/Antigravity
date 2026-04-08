package com.antigravity.data.db

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.antigravity.contract.*

/**
 * fetch_status テーブル — 単一行 (id=1) で最新の取得状態を保持。
 *
 * 不変条件:
 *   - 取得失敗時に価格行を書き換えない代わりに、ここで FAILED を記録する
 *   - fallbackUsed=true は「前回キャッシュを継続表示中」を意味する
 */
@Entity(tableName = "fetch_status")
data class FetchStatusEntity(
    @PrimaryKey val id: Int = 1,
    val sourceId: String = SourceId.SNAPSHOT_SERVER.name,
    val status: String,
    val lastAttemptAt: String? = null,
    val lastSuccessAt: String? = null,
    val lastErrorAt: String? = null,
    val errorKind: String? = null,
    val errorMessage: String? = null,
    val fallbackUsed: Boolean = false,
    val hasUsableCachedQuotes: Boolean = false,
)

fun FetchStatusEntity.toDomain() = SnapshotFetchState(
    sourceId              = SourceId.valueOf(sourceId),
    status                = SnapshotFetchState.FetchStatus.valueOf(status),
    lastAttemptAt         = lastAttemptAt,
    lastSuccessAt         = lastSuccessAt,
    lastErrorAt           = lastErrorAt,
    errorKind             = errorKind?.let { SnapshotFetchErrorKind.valueOf(it) },
    errorMessage          = errorMessage,
    fallbackUsed          = fallbackUsed,
    hasUsableCachedQuotes = hasUsableCachedQuotes,
)

fun SnapshotFetchState.toEntity() = FetchStatusEntity(
    sourceId              = sourceId.name,
    status                = status.name,
    lastAttemptAt         = lastAttemptAt,
    lastSuccessAt         = lastSuccessAt,
    lastErrorAt           = lastErrorAt,
    errorKind             = errorKind?.name,
    errorMessage          = errorMessage,
    fallbackUsed          = fallbackUsed,
    hasUsableCachedQuotes = hasUsableCachedQuotes,
)
