package com.antigravity.data.db

import androidx.room.*

@Dao
interface QuoteSnapshotDao {

    @Query("SELECT * FROM quote_snapshots")
    suspend fun getAll(): List<QuoteSnapshotEntity>

    @Query("SELECT COUNT(*) FROM quote_snapshots")
    suspend fun count(): Int

    @Upsert
    suspend fun upsertAll(quotes: List<QuoteSnapshotEntity>)

    @Query("DELETE FROM quote_snapshots")
    suspend fun deleteAll()
}
