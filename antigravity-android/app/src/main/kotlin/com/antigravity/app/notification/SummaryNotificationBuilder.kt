package com.antigravity.app.notification

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.antigravity.app.R
import com.antigravity.app.ui.MainActivity
import com.antigravity.app.worker.SyncNowReceiver

/**
 * 要約 / 状態通知のビルドと発行。
 *
 * Phase 4 追加 — 通知アクション:
 *   - 「開く」: MainActivity を起動 (FLAG_SINGLE_TOP)
 *   - 「今すぐ同期」: SyncNowReceiver 経由で MarketSyncWorker.runOnce() 発火
 *
 * 設計:
 *   - NOTIFICATION_SUMMARY : Worker 完了ごとに同じ ID で上書き。
 *     setOnlyAlertOnce=true → 初回のみ音、以降サイレント更新。
 *   - NOTIFICATION_STATUS  : fetch 失敗時のみ発行、成功復帰時に cancel。
 */
object SummaryNotificationBuilder {

    // ─── 要約通知 ─────────────────────────────────────────────────────────────

    fun postSummaryNotification(context: Context, summaryText: String) {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return

        val firstLine = summaryText.lines().firstOrNull() ?: summaryText
        val notification = NotificationCompat.Builder(context, NotificationChannels.CHANNEL_SUMMARY)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(context.getString(R.string.notification_summary_title))
            .setContentText(firstLine)
            .setStyle(NotificationCompat.BigTextStyle().bigText(summaryText))
            .setOnlyAlertOnce(true)
            .setAutoCancel(false)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(buildOpenIntent(context))
            .addAction(0, context.getString(R.string.notification_action_sync_now), buildSyncNowIntent(context))
            .build()

        @Suppress("MissingPermission")
        NotificationManagerCompat.from(context)
            .notify(NotificationChannels.NOTIFICATION_SUMMARY, notification)
    }

    // ─── 状態通知 ─────────────────────────────────────────────────────────────

    fun postStatusNotification(context: Context, statusText: String) {
        if (statusText.isBlank()) return
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return

        val notification = NotificationCompat.Builder(context, NotificationChannels.CHANNEL_STATUS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(context.getString(R.string.notification_status_title))
            .setContentText(statusText)
            .setOnlyAlertOnce(true)
            .setAutoCancel(false)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(buildOpenIntent(context))
            .addAction(0, context.getString(R.string.notification_action_sync_now), buildSyncNowIntent(context))
            .build()

        @Suppress("MissingPermission")
        NotificationManagerCompat.from(context)
            .notify(NotificationChannels.NOTIFICATION_STATUS, notification)
    }

    fun cancelStatusNotification(context: Context) {
        NotificationManagerCompat.from(context)
            .cancel(NotificationChannels.NOTIFICATION_STATUS)
    }

    // ─── PendingIntent helpers ─────────────────────────────────────────────────

    private fun buildOpenIntent(context: Context): PendingIntent =
        PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    private fun buildSyncNowIntent(context: Context): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            0,
            Intent(context, SyncNowReceiver::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
}
