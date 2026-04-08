package com.antigravity.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [
        QuoteSnapshotEntity::class,
        FetchStatusEntity::class,
        SummaryCacheEntity::class,
    ],
    version = 1,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {

    abstract fun quoteSnapshotDao(): QuoteSnapshotDao
    abstract fun fetchStatusDao(): FetchStatusDao
    abstract fun summaryCacheDao(): SummaryCacheDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getInstance(context: Context): AppDatabase =
            INSTANCE ?: synchronized(this) {
                INSTANCE ?: Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "antigravity.db",
                ).build().also { INSTANCE = it }
            }
    }
}
