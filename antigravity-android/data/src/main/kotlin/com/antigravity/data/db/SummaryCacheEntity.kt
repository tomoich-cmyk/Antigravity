package com.antigravity.data.db

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * summary_cache テーブル — 単一行 (id=1) で最新のサマリーテキストをキャッシュ。
 * 通知・Widget はここから読む。
 */
@Entity(tableName = "summary_cache")
data class SummaryCacheEntity(
    @PrimaryKey val id: Int = 1,
    val summaryText: String,
    val generatedAt: String,
    val sessionType: String? = null,
)
