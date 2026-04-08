package com.antigravity.app

import android.app.NotificationManager
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.antigravity.app.notification.NotificationChannels
import com.antigravity.app.notification.SummaryNotificationBuilder
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows
import org.robolectric.annotation.Config

/**
 * SummaryNotificationBuilder の単体テスト。
 *
 * Robolectric の ShadowNotificationManager で通知内容を検証する。
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class SummaryNotificationBuilderTest {

    private lateinit var context: Context
    private lateinit var notificationManager: NotificationManager

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        notificationManager = context.getSystemService(NotificationManager::class.java)
        NotificationChannels.createChannels(context)
    }

    // ─── postSummaryNotification ──────────────────────────────────────────────

    @Test
    fun `postSummaryNotification creates notification with CHANNEL_SUMMARY`() {
        SummaryNotificationBuilder.postSummaryNotification(
            context, "asset-gmopg: 現在値 9,920円\nasset-unext: 4/5 終値 3,450円"
        )

        val shadow = Shadows.shadowOf(notificationManager)
        val notification = shadow.getNotification(NotificationChannels.NOTIFICATION_SUMMARY)
        assertNotNull("通知が発行されていない", notification)
        assertEquals(NotificationChannels.CHANNEL_SUMMARY, notification!!.channelId)
    }

    @Test
    fun `postSummaryNotification replaces existing notification with same ID`() {
        SummaryNotificationBuilder.postSummaryNotification(context, "first")
        SummaryNotificationBuilder.postSummaryNotification(context, "second")

        val shadow = Shadows.shadowOf(notificationManager)
        // 同じ ID で 2 回発行しても 1 件だけ残る
        assertEquals(1, shadow.allNotifications.count {
            it.channelId == NotificationChannels.CHANNEL_SUMMARY
        })
    }

    @Test
    fun `postSummaryNotification does nothing when notifications are disabled`() {
        // Robolectric で通知を無効化
        Shadows.shadowOf(notificationManager).setNotificationsEnabled(false)

        SummaryNotificationBuilder.postSummaryNotification(context, "should not post")

        val shadow = Shadows.shadowOf(notificationManager)
        assertTrue("通知が発行されてはいけない", shadow.allNotifications.isEmpty())

        // 後続テストのためにリセット
        Shadows.shadowOf(notificationManager).setNotificationsEnabled(true)
    }

    // ─── postStatusNotification ───────────────────────────────────────────────

    @Test
    fun `postStatusNotification creates notification with CHANNEL_STATUS`() {
        val statusText = "市場データの更新に失敗したため、前回取得分を表示しています。"
        SummaryNotificationBuilder.postStatusNotification(context, statusText)

        val shadow = Shadows.shadowOf(notificationManager)
        val notification = shadow.getNotification(NotificationChannels.NOTIFICATION_STATUS)
        assertNotNull("状態通知が発行されていない", notification)
        assertEquals(NotificationChannels.CHANNEL_STATUS, notification!!.channelId)
    }

    @Test
    fun `postStatusNotification does nothing when statusText is blank`() {
        SummaryNotificationBuilder.postStatusNotification(context, "")

        val shadow = Shadows.shadowOf(notificationManager)
        assertTrue(shadow.allNotifications.none {
            it.channelId == NotificationChannels.CHANNEL_STATUS
        })
    }

    // ─── cancelStatusNotification ─────────────────────────────────────────────

    @Test
    fun `cancelStatusNotification removes status notification`() {
        // 状態通知を発行してからキャンセル
        SummaryNotificationBuilder.postStatusNotification(
            context, "市場データの更新に失敗したため、前回取得分を表示しています。"
        )
        val shadow = Shadows.shadowOf(notificationManager)
        assertNotNull(shadow.getNotification(NotificationChannels.NOTIFICATION_STATUS))

        SummaryNotificationBuilder.cancelStatusNotification(context)

        assertNull(
            "cancelStatusNotification 後に状態通知が残っている",
            shadow.getNotification(NotificationChannels.NOTIFICATION_STATUS),
        )
    }

    @Test
    fun `cancelStatusNotification does not affect summary notification`() {
        // 要約通知と状態通知を両方発行
        SummaryNotificationBuilder.postSummaryNotification(context, "summary text")
        SummaryNotificationBuilder.postStatusNotification(
            context, "市場データの更新に失敗したため、前回取得分を表示しています。"
        )

        // 状態通知だけキャンセル
        SummaryNotificationBuilder.cancelStatusNotification(context)

        val shadow = Shadows.shadowOf(notificationManager)
        // 要約通知は残っている
        assertNotNull(shadow.getNotification(NotificationChannels.NOTIFICATION_SUMMARY))
        // 状態通知は消えている
        assertNull(shadow.getNotification(NotificationChannels.NOTIFICATION_STATUS))
    }
}
