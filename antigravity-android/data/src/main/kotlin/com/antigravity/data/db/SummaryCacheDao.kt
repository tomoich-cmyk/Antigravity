package com.antigravity.data.db

import androidx.room.*

@Dao
interface SummaryCacheDao {

    @Query("SELECT * FROM summary_cache WHERE id = 1")
    suspend fun get(): SummaryCacheEntity?

    @Upsert
    suspend fun upsert(entity: SummaryCacheEntity)
}
