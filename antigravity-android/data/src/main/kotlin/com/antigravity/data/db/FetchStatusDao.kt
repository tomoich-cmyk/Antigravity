package com.antigravity.data.db

import androidx.room.*

@Dao
interface FetchStatusDao {

    @Query("SELECT * FROM fetch_status WHERE id = 1")
    suspend fun get(): FetchStatusEntity?

    @Upsert
    suspend fun upsert(entity: FetchStatusEntity)
}
