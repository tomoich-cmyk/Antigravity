package com.antigravity.app.widget

import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver

/**
 * Glance AppWidget のエントリポイント。
 *
 * Manifest に android.appwidget.action.APPWIDGET_UPDATE で登録する。
 * 実際の描画は AntigravityWidget.provideGlance() が担う。
 */
class AntigravityWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = AntigravityWidget()
}
