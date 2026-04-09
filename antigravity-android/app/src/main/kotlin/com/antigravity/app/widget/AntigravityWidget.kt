package com.antigravity.app.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalSize
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import com.antigravity.app.AntigravityApp
import com.antigravity.contract.FreshnessLevel
import com.antigravity.engine.MarketClock
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.ZonedDateTime

/**
 * Antigravity Glance ウィジェット — Phase 3-C。
 *
 * サイズ戦略:
 *   SizeMode.Responsive で SMALL / MEDIUM の2バリアントを定義。
 *   LocalSize.current.width で分岐し、1つの GlanceAppWidget が両レイアウトを提供する。
 *
 * 更新戦略:
 *   WorkManager (MarketSyncWorker) の doWork() 完了後に updateAll() を呼ぶ。
 *   android:updatePeriodMillis="0" でシステムによる定期呼び出しを無効化。
 *
 * データ戦略:
 *   provideGlance 内で Room から直接読み込む (withContext(Dispatchers.IO))。
 *   Small: summary_cache + fetch_status
 *   Medium: quote_snapshots + fetch_status
 *   Glance state は持たない — Room が正本。
 */
class AntigravityWidget : GlanceAppWidget() {

    override val sizeMode: SizeMode = SizeMode.Responsive(setOf(SMALL, MEDIUM))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val repo = (context.applicationContext as AntigravityApp).repository
        val now  = ZonedDateTime.now(MarketClock.JST)

        val summary     = withContext(Dispatchers.IO) { repo.loadSummary() }
        val fetchStatus = withContext(Dispatchers.IO) { repo.loadFetchStatus() }
        val quotes      = withContext(Dispatchers.IO) { repo.loadLatestQuotes() }

        val uiState = WidgetStateMapper.map(summary, fetchStatus, quotes, now)

        provideContent {
            WidgetContent(uiState = uiState)
        }
    }

    companion object {
        internal val SMALL  = DpSize(140.dp, 110.dp)
        internal val MEDIUM = DpSize(250.dp, 110.dp)
    }
}

// ─── Content dispatcher ───────────────────────────────────────────────────────

@Composable
internal fun WidgetContent(uiState: WidgetUiState) {
    val size = LocalSize.current
    if (size.width >= AntigravityWidget.MEDIUM.width) {
        MediumContent(uiState)
    } else {
        SmallContent(uiState)
    }
}

// ─── Small (2×1 相当) ─────────────────────────────────────────────────────────

@Composable
private fun SmallContent(uiState: WidgetUiState) {
    val bgColor   = if (uiState.isFailure) Color(0xFFFFEBEE) else Color(0xFFFFFFFF)
    val textColor = if (uiState.isFailure) Color(0xFFB71C1C) else Color(0xFF212121)

    Column(
        modifier            = GlanceModifier
            .fillMaxSize()
            .background(ColorProvider(bgColor))
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment   = Alignment.CenterVertically,
        horizontalAlignment = Alignment.Start,
    ) {
        Text(
            text     = uiState.summaryLine,
            style    = TextStyle(
                fontSize   = 12.sp,
                fontWeight = FontWeight.Medium,
                color      = ColorProvider(textColor),
            ),
            maxLines = 2,
        )
        if (uiState.lastSyncAt != null) {
            Spacer(GlanceModifier.height(3.dp))
            Text(
                text  = formatWidgetSyncTime(uiState.lastSyncAt),
                style = TextStyle(
                    fontSize = 10.sp,
                    color    = ColorProvider(Color(0xFF757575)),
                ),
            )
        }
        if (uiState.isFallback) {
            Spacer(GlanceModifier.height(2.dp))
            Text(
                text  = "前回値",
                style = TextStyle(
                    fontSize = 9.sp,
                    color    = ColorProvider(Color(0xFFFF6F00)),
                ),
            )
        }
    }
}

// ─── Medium (4×1 相当) ────────────────────────────────────────────────────────

@Composable
private fun MediumContent(uiState: WidgetUiState) {
    Column(
        modifier            = GlanceModifier
            .fillMaxSize()
            .background(ColorProvider(Color(0xFFFFFFFF)))
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment   = Alignment.Top,
        horizontalAlignment = Alignment.Start,
    ) {
        // ─── ヘッダー行: エラー状態 or 最終同期時刻 ──────────────────────────
        val headerText = when {
            uiState.isFailure && uiState.isFallback -> "⚠ 前回値"
            uiState.isFailure                       -> "⚠ 取得エラー"
            uiState.lastSyncAt != null               -> "同期: ${formatWidgetSyncTime(uiState.lastSyncAt)}"
            else                                     -> "Antigravity"
        }
        Text(
            text  = headerText,
            style = TextStyle(
                fontSize = 10.sp,
                color    = ColorProvider(
                    if (uiState.isFailure) Color(0xFFB71C1C) else Color(0xFF757575),
                ),
            ),
        )

        Spacer(GlanceModifier.height(4.dp))

        // ─── 資産行 (最大3件) ─────────────────────────────────────────────────
        if (uiState.quoteRows.isEmpty()) {
            Text(
                text  = "データなし",
                style = TextStyle(
                    fontSize = 12.sp,
                    color    = ColorProvider(Color(0xFF9E9E9E)),
                ),
            )
        } else {
            uiState.quoteRows.forEach { row ->
                WidgetQuoteRowItem(row)
                Spacer(GlanceModifier.height(2.dp))
            }
        }
    }
}

// ─── Quote row item ───────────────────────────────────────────────────────────

@Composable
private fun WidgetQuoteRowItem(row: WidgetQuoteRow) {
    val dotColor = when (row.freshnessLevel) {
        FreshnessLevel.FRESH   -> Color(0xFF4CAF50)   // 緑
        FreshnessLevel.LAGGING -> Color(0xFFFFA726)   // オレンジ
        FreshnessLevel.STALE   -> Color(0xFFE53935)   // 赤
        FreshnessLevel.UNKNOWN -> Color(0xFF9E9E9E)   // グレー
    }
    Row(
        modifier          = GlanceModifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // 鮮度ドット (RemoteViews 制約で CircleShape 不可 → 正方形)
        Box(
            modifier = GlanceModifier
                .width(7.dp)
                .height(7.dp)
                .background(ColorProvider(dotColor)),
        ) {}
        Spacer(GlanceModifier.width(5.dp))
        // 資産名 (残余スペースを占有)
        Text(
            text     = row.displayName,
            style    = TextStyle(
                fontSize = 11.sp,
                color    = ColorProvider(Color(0xFF424242)),
            ),
            modifier = GlanceModifier.defaultWeight(),
        )
        Spacer(GlanceModifier.width(4.dp))
        // 価格 + 時刻ラベル (右揃え)
        Column(
            horizontalAlignment = Alignment.End,
        ) {
            Text(
                text  = row.price,
                style = TextStyle(
                    fontSize   = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color      = ColorProvider(Color(0xFF212121)),
                ),
            )
            Text(
                text  = row.timeLabel,
                style = TextStyle(
                    fontSize = 9.sp,
                    color    = ColorProvider(Color(0xFF9E9E9E)),
                ),
            )
        }
    }
}

// ─── helper ───────────────────────────────────────────────────────────────────

/**
 * ISO-8601 JST 文字列を "M/d HH:mm" 形式に変換する。
 * パース失敗時は "---" を返す。
 * (HomeScreen.formatSyncTime と同一ロジック)
 */
internal fun formatWidgetSyncTime(isoString: String): String = try {
    val zdt = MarketClock.parseJst(isoString)
    val hh  = zdt.hour.toString().padStart(2, '0')
    val mm  = zdt.minute.toString().padStart(2, '0')
    "${zdt.monthValue}/${zdt.dayOfMonth} $hh:$mm"
} catch (_: Exception) {
    "---"
}
