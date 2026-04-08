package com.antigravity.app.notification

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import com.antigravity.app.R

/**
 * 通知チャンネル ID と初期化 — Android 8.0+ 必須。
 *
 * チャンネル設計:
 *   CHANNEL_SUMMARY : 市場サマリー — IMPORTANCE_DEFAULT (バッジ + 音 1 回)
 *   CHANNEL_STATUS  : 同期状態 — IMPORTANCE_LOW (サイレント、状態変化のみ)
 *
 * 通知 ID:
 *   NOTIFICATION_SUMMARY : 毎 Worker 完了後に上書き更新（setOnlyAlertOnce=true）
 *   NOTIFICATION_STATUS  : fetch 失敗時のみ表示、成功復帰時に cancel
 */
object NotificationChannels {

    const val CHANNEL_SUMMARY = "market_summary"
    const val CHANNEL_STATUS  = "market_status"

    const val NOTIFICATION_SUMMARY = 1001
    const val NOTIFICATION_STATUS  = 1002

    /**
     * 通知チャンネルを作成する。
     * 既存チャンネルがある場合は上書きされないので、何度呼んでも安全。
     */
    fun createChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return

        val summaryChannel = NotificationChannel(
            CHANNEL_SUMMARY,
            context.getString(R.string.notification_channel_summary_name),
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = context.getString(R.string.notification_channel_summary_desc)
        }

        val statusChannel = NotificationChannel(
            CHANNEL_STATUS,
            context.getString(R.string.notification_channel_status_name),
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = context.getString(R.string.notification_channel_status_desc)
        }

        manager.createNotificationChannels(listOf(summaryChannel, statusChannel))
    }
}
