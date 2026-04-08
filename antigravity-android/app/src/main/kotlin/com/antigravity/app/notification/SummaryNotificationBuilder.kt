package com.antigravity.app.notification

import android.content.Context
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.antigravity.app.R

/**
 * 要約 / 状態通知のビルドと発行。
 *
 * 設計方針:
 *   - NOTIFICATION_SUMMARY : Worker 完了ごとに同じ ID で上書き。
 *     setOnlyAlertOnce=true により、初回のみ音が鳴る（それ以降はサイレント更新）。
 *   - NOTIFICATION_STATUS  : fetch 失敗時のみ発行、成功復帰時に cancel。
 *     fallback 継続中であることをユーザーに明示する。
 *
 * 権限チェック:
 *   areNotificationsEnabled() が false の場合はサイレントに何もしない。
 *   Android 13+ の POST_NOTIFICATIONS 未承認状態でも安全。
 */
object SummaryNotificationBuilder {

    // ─── 要約通知 ─────────────────────────────────────────────────────────────

    /**
     * 最新の summary_cache テキストを要約通知として発行する。
     *
     * @param summaryText summary_cache.summaryText
     */
    fun postSummaryNotification(context: Context, summaryText: String) {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return

        val firstLine = summaryText.lines().firstOrNull() ?: summaryText
        val notification = NotificationCompat.Builder(context, NotificationChannels.CHANNEL_SUMMARY)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(context.getString(R.string.notification_summary_title))
            .setContentText(firstLine)
            .setStyle(NotificationCompat.BigTextStyle().bigText(summaryText))
            .setOnlyAlertOnce(true)   // 初回のみ音、以降サイレント更新
            .setAutoCancel(false)     // タップしても消えない
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()

        @Suppress("MissingPermission")
        NotificationManagerCompat.from(context)
            .notify(NotificationChannels.NOTIFICATION_SUMMARY, notification)
    }

    // ─── 状態通知 ─────────────────────────────────────────────────────────────

    /**
     * fetch failure / fallback 状態通知を発行する。
     * fetch 成功時は cancelStatusNotification() で消す。
     *
     * @param statusText SummaryTextBuilder.buildFetchStatusText() の出力
     */
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
            .build()

        @Suppress("MissingPermission")
        NotificationManagerCompat.from(context)
            .notify(NotificationChannels.NOTIFICATION_STATUS, notification)
    }

    /**
     * 状態通知を非表示にする。
     * fetch 成功復帰後に呼ぶことで fallback 警告をクリアする。
     */
    fun cancelStatusNotification(context: Context) {
        NotificationManagerCompat.from(context)
            .cancel(NotificationChannels.NOTIFICATION_STATUS)
    }
}
