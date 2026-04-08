package com.antigravity.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.antigravity.app.ui.theme.AntigravityTheme
import com.antigravity.contract.FreshnessLevel
import com.antigravity.contract.SnapshotFetchState
import com.antigravity.engine.MarketClock

/**
 * Home 画面 — 読み取り専用ダッシュボード (Phase 3-B)。
 *
 * 表示内容:
 *   - 最終同期時刻 / 同期エラー状態バー
 *   - 資産ごとの価格カード (現在値 / 終値 / 基準価額 / asOfLabel)
 *   - 鮮度ドット (FRESH=緑 / LAGGING=オレンジ / STALE=赤 / UNKNOWN=グレー)
 *
 * 編集機能なし。Phase 3-C で Widget 連動、Phase 4 で編集機能を追加予定。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    uiState: HomeUiState,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Antigravity") },
                actions = {
                    TextButton(onClick = onRefresh) {
                        Text("更新")
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = modifier
                .padding(innerPadding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
        ) {
            // ─── ステータスバー ────────────────────────────────────────────────
            StatusBar(uiState = uiState)

            Spacer(modifier = Modifier.height(12.dp))

            // ─── 価格カード一覧 ────────────────────────────────────────────────
            when {
                uiState.isLoading -> {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 48.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator()
                    }
                }
                uiState.isEmpty -> {
                    EmptyState()
                }
                else -> {
                    uiState.quoteRows.forEach { row ->
                        QuoteCard(row = row)
                        Spacer(modifier = Modifier.height(8.dp))
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

// ─── StatusBar ────────────────────────────────────────────────────────────────

@Composable
private fun StatusBar(uiState: HomeUiState) {
    val containerColor = if (uiState.isFailure)
        MaterialTheme.colorScheme.errorContainer
    else
        MaterialTheme.colorScheme.surfaceVariant

    val textColor = if (uiState.isFailure)
        MaterialTheme.colorScheme.onErrorContainer
    else
        MaterialTheme.colorScheme.onSurfaceVariant

    Surface(
        color    = containerColor,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            when {
                uiState.isFailure && uiState.isFallback -> {
                    Text("⚠", style = MaterialTheme.typography.bodySmall)
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text  = "同期エラー — 前回取得分を表示中",
                        style = MaterialTheme.typography.bodyMedium,
                        color = textColor,
                    )
                }
                uiState.isFailure -> {
                    Text("⚠", style = MaterialTheme.typography.bodySmall)
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text  = "同期エラー — データを取得できませんでした",
                        style = MaterialTheme.typography.bodyMedium,
                        color = textColor,
                    )
                }
                else -> {
                    val syncText = uiState.lastSyncAt?.let { formatSyncTime(it) } ?: "---"
                    Text(
                        text  = "最終同期: $syncText",
                        style = MaterialTheme.typography.bodySmall,
                        color = textColor,
                    )
                }
            }
        }
    }
}

// ─── QuoteCard ────────────────────────────────────────────────────────────────

@Composable
private fun QuoteCard(row: QuoteRowData, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
    ) {
        Row(
            modifier            = Modifier
                .padding(horizontal = 16.dp, vertical = 14.dp)
                .fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment   = Alignment.CenterVertically,
        ) {
            // 左: 資産名 + 時刻ラベル
            Column {
                Text(
                    text  = row.displayName,
                    style = MaterialTheme.typography.titleMedium,
                )
                Text(
                    text  = row.timeLabel,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            // 右: 鮮度ドット + 価格
            Row(verticalAlignment = Alignment.CenterVertically) {
                FreshnessDot(level = row.freshnessLevel)
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text  = row.price,
                    style = MaterialTheme.typography.titleLarge,
                )
            }
        }
    }
}

// ─── FreshnessDot ─────────────────────────────────────────────────────────────

@Composable
private fun FreshnessDot(level: FreshnessLevel) {
    val color = when (level) {
        FreshnessLevel.FRESH   -> Color(0xFF4CAF50)    // 緑: 現在値
        FreshnessLevel.LAGGING -> Color(0xFFFFA726)    // オレンジ: やや遅延
        FreshnessLevel.STALE   -> MaterialTheme.colorScheme.error  // 赤: 更新注意
        FreshnessLevel.UNKNOWN -> MaterialTheme.colorScheme.outline // グレー: 不明
    }
    Box(
        modifier = Modifier
            .size(8.dp)
            .background(color = color, shape = CircleShape),
    )
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

@Composable
private fun EmptyState() {
    Box(
        modifier          = Modifier
            .fillMaxWidth()
            .padding(vertical = 64.dp),
        contentAlignment  = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text  = "データなし",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text  = "「更新」をタップしてデータを取得してください",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.outline,
            )
        }
    }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * ISO-8601 JST 文字列を "M/d HH:mm" 形式に変換する。
 * パース失敗時は "---" を返す。
 */
internal fun formatSyncTime(isoString: String): String = try {
    val zdt = MarketClock.parseJst(isoString)
    val hh  = zdt.hour.toString().padStart(2, '0')
    val mm  = zdt.minute.toString().padStart(2, '0')
    "${zdt.monthValue}/${zdt.dayOfMonth} $hh:$mm"
} catch (e: Exception) {
    "---"
}

// ─── Preview ──────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Preview(showBackground = true)
@Composable
private fun HomeScreenPreview() {
    AntigravityTheme {
        HomeScreen(
            uiState = HomeUiState(
                quoteRows = listOf(
                    QuoteRowData(
                        assetId           = "asset-gmopg",
                        displayName       = "GMO-PG",
                        price             = "9,920円",
                        timeLabel         = "現在値",
                        freshnessLevel    = FreshnessLevel.FRESH,
                        canPretendCurrent = true,
                    ),
                    QuoteRowData(
                        assetId           = "asset-unext",
                        displayName       = "U-NEXT",
                        price             = "3,450円",
                        timeLabel         = "4/5 終値",
                        freshnessLevel    = FreshnessLevel.STALE,
                        canPretendCurrent = false,
                    ),
                ),
                fetchStatus = null,
                lastSyncAt  = "2024-04-08T10:30:00+09:00",
                isLoading   = false,
            ),
            onRefresh = {},
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Preview(showBackground = true)
@Composable
private fun HomeScreenFallbackPreview() {
    AntigravityTheme {
        HomeScreen(
            uiState = HomeUiState(
                quoteRows = listOf(
                    QuoteRowData(
                        assetId           = "asset-gmopg",
                        displayName       = "GMO-PG",
                        price             = "9,870円",
                        timeLabel         = "4/6 10:10時点",
                        freshnessLevel    = FreshnessLevel.LAGGING,
                        canPretendCurrent = false,
                    ),
                ),
                fetchStatus = SnapshotFetchState(
                    status       = SnapshotFetchState.FetchStatus.FAILED,
                    fallbackUsed = true,
                    hasUsableCachedQuotes = true,
                ),
                lastSyncAt  = "2024-04-06T10:10:00+09:00",
                isLoading   = false,
            ),
            onRefresh = {},
        )
    }
}
