package com.antigravity.app

import android.app.Application
import androidx.work.Configuration
import androidx.work.WorkManager
import com.antigravity.app.notification.NotificationChannels
import com.antigravity.app.worker.MarketSyncWorker
import com.antigravity.data.db.AppDatabase
import com.antigravity.data.repository.MarketRepository

/**
 * Application クラス — WorkManager 手動初期化 / 通知チャンネル作成 / 起動時同期。
 *
 * 初期化順序:
 *   1. WorkManager.initialize  — テスト差し替えのため手動
 *   2. NotificationChannels.createChannels — チャンネルは一度だけ作れば OK
 *   3. schedulePeriodicSync    — 15 分定期同期 (KEEP: 重複登録しない)
 *   4. runOnce                 — 起動時に即時 1 回取得 (REPLACE: 最新データを優先)
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
        NotificationChannels.createChannels(this)
        MarketSyncWorker.schedulePeriodicSync(this)
        MarketSyncWorker.runOnce(this)          // 起動時に即時取得
    }

    // Configuration.Provider の実装（手動初期化）
    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setMinimumLoggingLevel(android.util.Log.INFO)
            .build()
}
