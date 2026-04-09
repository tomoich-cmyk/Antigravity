package com.antigravity.app.worker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * 通知アクション「今すぐ同期」のエントリポイント。
 *
 * SummaryNotificationBuilder の PendingIntent から呼ばれる。
 * 受信したら MarketSyncWorker.runOnce() を発火するだけ。
 *
 * 設計:
 *   - 通知からアプリを開かなくても即時同期をトリガーできる
 *   - WorkManager が重複実行を REPLACE ポリシーで管理するため多重発火は安全
 */
class SyncNowReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        MarketSyncWorker.runOnce(context)
    }
}
