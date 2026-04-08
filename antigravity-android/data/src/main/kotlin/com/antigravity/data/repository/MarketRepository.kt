package com.antigravity.data.repository

import com.antigravity.contract.QuoteSnapshot
import com.antigravity.contract.SnapshotFetchState
import com.antigravity.data.db.AppDatabase
import com.antigravity.data.db.SummaryCacheEntity
import com.antigravity.data.db.toDomain
import com.antigravity.data.db.toEntity

/**
 * Room DB への read / write を集約するリポジトリ。
 *
 * 縮退ルール:
 *   - fetch 失敗時は saveQuoteSnapshots を呼ばない。
 *     呼び出し側 (MarketSyncWorker) が責任を持つ。
 *   - saveFetchStatus は成功・失敗どちらでも必ず呼ぶ。
 */
class MarketRepository(private val db: AppDatabase) {

    // ─── QuoteSnapshot ────────────────────────────────────────────────────────

    /**
     * 既存の quote_snapshots を全削除してから新しい行を upsert する。
     * fetch 成功時のみ呼ぶこと（縮退ルール）。
     */
    suspend fun saveQuoteSnapshots(quotes: List<QuoteSnapshot>) {
        db.quoteSnapshotDao().deleteAll()
        db.quoteSnapshotDao().upsertAll(quotes.map { it.toEntity() })
    }

    /** DB から全スナップショットを読み込む。キャッシュが空なら空リスト。 */
    suspend fun loadLatestQuotes(): List<QuoteSnapshot> =
        db.quoteSnapshotDao().getAll().map { it.toDomain() }

    /** DB にスナップショットが 1 件以上あれば true。 */
    suspend fun hasQuotes(): Boolean =
        db.quoteSnapshotDao().count() > 0

    // ─── FetchStatus ─────────────────────────────────────────────────────────

    /** fetch_status テーブルを upsert (単一行 id=1)。 */
    suspend fun saveFetchStatus(state: SnapshotFetchState) {
        db.fetchStatusDao().upsert(state.toEntity())
    }

    /** 最新の fetch_status を返す。未保存なら null。 */
    suspend fun loadFetchStatus(): SnapshotFetchState? =
        db.fetchStatusDao().get()?.toDomain()

    // ─── SummaryCache ─────────────────────────────────────────────────────────

    /** summary_cache テーブルを upsert (単一行 id=1)。 */
    suspend fun saveSummary(entity: SummaryCacheEntity) {
        db.summaryCacheDao().upsert(entity)
    }

    /** 最新のキャッシュサマリーを返す。未保存なら null。 */
    suspend fun loadSummary(): SummaryCacheEntity? =
        db.summaryCacheDao().get()
}
