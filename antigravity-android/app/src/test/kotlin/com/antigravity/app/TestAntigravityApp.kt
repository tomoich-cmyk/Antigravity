package com.antigravity.app

import android.app.Application
import androidx.work.Configuration
import androidx.work.testing.WorkManagerTestInitHelper
import com.antigravity.data.db.AppDatabase
import com.antigravity.data.repository.MarketRepository

/**
 * テスト用 Application クラス。
 *
 * RobolectricTestRunner が application= で指定するクラス。
 * テストケースから testDatabase / testRepository を注入して使う。
 */
class TestAntigravityApp : Application(), Configuration.Provider {

    var testDatabase: AppDatabase? = null
    var testRepository: MarketRepository? = null

    val database: AppDatabase get() = testDatabase!!
    val repository: MarketRepository get() = testRepository!!

    override fun onCreate() {
        super.onCreate()
        WorkManagerTestInitHelper.initializeTestWorkManager(this, workManagerConfiguration)
    }

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setMinimumLoggingLevel(android.util.Log.DEBUG)
            .build()
}
