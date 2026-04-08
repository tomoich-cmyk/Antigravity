package com.antigravity.app

import android.app.Application
import androidx.work.Configuration
import androidx.work.WorkManager
import com.antigravity.app.worker.MarketSyncWorker
import com.antigravity.data.db.AppDatabase
import com.antigravity.data.repository.MarketRepository

/**
 * Application クラス — WorkManager の手動初期化とシングルトン依存の構築。
 *
 * WorkManager を手動で初期化することで、
 * テスト時に WorkManagerTestInitHelper で差し替えが可能になる。
 */
class AntigravityApp : Application(), Configuration.Provider {

    /** シングルトン DB インスタンス */
    val database: AppDatabase by lazy {
        AppDatabase.getInstance(this)
    }

    /** シングルトン Repository インスタンス */
    val repository: MarketRepository by lazy {
        MarketRepository(database)
    }

    override fun onCreate() {
        super.onCreate()
        WorkManager.initialize(this, workManagerConfiguration)
        MarketSyncWorker.schedulePeriodicSync(this)
    }

    // Configuration.Provider の実装（手動初期化）
    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setMinimumLoggingLevel(android.util.Log.INFO)
            .build()
}
