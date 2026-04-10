package com.antigravity.data.db

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.antigravity.contract.*

/**
 * quote_snapshots テーブル — assetId をキーとした最新価格を 1 行保持。
 * 新しい値で upsert し、常に最新のみを保持する設計。
 */
@Entity(tableName = "quote_snapshots")
data class QuoteSnapshotEntity(
    @PrimaryKey val assetId: String,
    val assetClass: String,
    val value: Double,
    val currency: String,
    val quoteKind: String,
    val sourceId: String,
    val sourceMode: String,
    val sourceLabel: String,
    val syncedAt: String,
    val marketDataAt: String?,
    val baselineDate: String,
    /** 前日比 (%) — DB version 2 で追加。null = 不明 */
    val changePct: Double? = null,
)

fun QuoteSnapshotEntity.toDomain() = QuoteSnapshot(
    assetId      = assetId,
    assetClass   = AssetClass.valueOf(assetClass),
    value        = value,
    currency     = currency,
    quoteKind    = QuoteKind.valueOf(quoteKind),
    source       = QuoteSource(
        id    = SourceId.valueOf(sourceId),
        mode  = SourceMode.valueOf(sourceMode),
        label = sourceLabel,
    ),
    syncedAt     = syncedAt,
    marketDataAt = marketDataAt,
    baselineDate = baselineDate,
    changePct    = changePct,
)

fun QuoteSnapshot.toEntity() = QuoteSnapshotEntity(
    assetId      = assetId,
    assetClass   = assetClass.name,
    value        = value,
    currency     = currency,
    quoteKind    = quoteKind.name,
    sourceId     = source.id.name,
    sourceMode   = source.mode.name,
    sourceLabel  = source.label,
    syncedAt     = syncedAt,
    marketDataAt = marketDataAt,
    baselineDate = baselineDate,
    changePct    = changePct,
)
