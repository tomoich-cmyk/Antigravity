package com.antigravity.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.tooling.preview.Preview
import com.antigravity.app.ui.theme.AntigravityTheme
import com.antigravity.contract.FreshnessLevel

/**
 * 診断画面 — 運用確認用 runbook ページ。
 *
 * 表示内容:
 *   - 同期状態: fetch_status の全フィールド (時刻 / ステータス / fallback / errorKind)
 *   - 資産詳細: 各 assetId の quoteKind / baselineDate / timeLabel / freshnessLevel
 *
 * 目的: Widget と通知が何を元に出力しているかを即座に確認できるようにする。
 * 派手な UI 不要。情報密度優先。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiagnosticsScreen(
    uiState: DiagnosticsUiState,
    onRefresh: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("診断") },
                navigationIcon = {
                    TextButton(onClick = onBack) { Text("←") }
                },
                actions = {
                    TextButton(onClick = onRefresh) { Text("更新") }
                },
            )
        },
    ) { innerPadding ->
        if (uiState.isLoading) {
            Box(
                modifier = Modifier.fillMaxSize().padding(innerPadding),
                contentAlignment = Alignment.Center,
            ) { CircularProgressIndicator() }
        } else {
            Column(
                modifier = modifier
                    .padding(innerPadding)
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                // ─── 同期状態カード ─────────────────────────────────────────────
                SyncStatusCard(uiState)

                // ─── 資産詳細カード ─────────────────────────────────────────────
                if (uiState.quoteRows.isEmpty()) {
                    EmptyQuotesCard()
                } else {
                    uiState.quoteRows.forEach { row ->
                        QuoteDiagCard(row)
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))
            }
        }
    }
}

// ─── SyncStatusCard ───────────────────────────────────────────────────────────

@Composable
private fun SyncStatusCard(uiState: DiagnosticsUiState) {
    val borderColor = when (uiState.fetchStatusLabel) {
        "FAILED" -> MaterialTheme.colorScheme.errorContainer
        "SUCCESS" -> MaterialTheme.colorScheme.primaryContainer
        else     -> MaterialTheme.colorScheme.surfaceVariant
    }

    Card(
        modifier  = Modifier.fillMaxWidth(),
        colors    = CardDefaults.cardColors(containerColor = borderColor),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("同期状態", style = MaterialTheme.typography.titleSmall)
            HorizontalDivider()
            DiagRow("ステータス", uiState.fetchStatusLabel)
            DiagRow("最終成功", uiState.lastSyncAt?.let { formatSyncTime(it) } ?: "未同期")
            DiagRow("前回試行", uiState.lastAttemptAt?.let { formatSyncTime(it) } ?: "---")
            DiagRow("fallback", if (uiState.fallbackUsed) "true (前回値表示中)" else "false")
            if (uiState.errorKind != null) {
                DiagRow("エラー種別", uiState.errorKind)
            }
            if (uiState.errorMessage != null) {
                DiagRow("エラー詳細", uiState.errorMessage, mono = true)
            }
        }
    }
}

// ─── QuoteDiagCard ────────────────────────────────────────────────────────────

@Composable
private fun QuoteDiagCard(row: DiagnosticsQuoteRow) {
    val freshnessColor = when (row.freshnessLevel) {
        FreshnessLevel.FRESH   -> MaterialTheme.colorScheme.primaryContainer
        FreshnessLevel.LAGGING -> MaterialTheme.colorScheme.tertiaryContainer
        FreshnessLevel.STALE   -> MaterialTheme.colorScheme.errorContainer
        FreshnessLevel.UNKNOWN -> MaterialTheme.colorScheme.surfaceVariant
    }

    Card(
        modifier  = Modifier.fillMaxWidth(),
        colors    = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(row.displayName, style = MaterialTheme.typography.titleSmall)
                Surface(
                    color  = freshnessColor,
                    shape  = MaterialTheme.shapes.small,
                ) {
                    Text(
                        text     = row.freshnessLevel.name,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                        style    = MaterialTheme.typography.labelSmall,
                    )
                }
            }
            HorizontalDivider()
            DiagRow("assetId",      row.assetId, mono = true)
            DiagRow("quoteKind",    row.quoteKind)
            DiagRow("baselineDate", row.baselineDate, mono = true)
            DiagRow("表示ラベル",   row.timeLabel + if (row.canPretendCurrent) " ✓現在値" else "")
            DiagRow("syncedAt",     formatSyncTime(row.syncedAt), mono = true)
            DiagRow("marketDataAt", row.marketDataAt?.let { formatSyncTime(it) } ?: "null")
        }
    }
}

// ─── EmptyQuotesCard ──────────────────────────────────────────────────────────

@Composable
private fun EmptyQuotesCard() {
    Card(modifier = Modifier.fillMaxWidth()) {
        Box(modifier = Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
            Text(
                text  = "quote_snapshots が空です。「更新」で同期してください。",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

// ─── DiagRow ──────────────────────────────────────────────────────────────────

@Composable
private fun DiagRow(label: String, value: String, mono: Boolean = false) {
    Row(modifier = Modifier.fillMaxWidth()) {
        Text(
            text     = label,
            modifier = Modifier.width(100.dp),
            style    = MaterialTheme.typography.bodySmall,
            color    = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text  = value,
            style = if (mono)
                MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace)
            else
                MaterialTheme.typography.bodySmall,
        )
    }
}

// ─── Preview ──────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Preview(showBackground = true)
@Composable
private fun DiagnosticsScreenPreview() {
    AntigravityTheme {
        DiagnosticsScreen(
            uiState = DiagnosticsUiState(
                isLoading        = false,
                fetchStatusLabel = "SUCCESS",
                lastSyncAt       = "2024-04-08T10:30:00+09:00",
                lastAttemptAt    = "2024-04-08T10:30:00+09:00",
                fallbackUsed     = false,
                errorKind        = null,
                quoteRows = listOf(
                    DiagnosticsQuoteRow(
                        assetId           = "asset-gmopg",
                        displayName       = "GMO-PG",
                        quoteKind         = "INTRADAY",
                        baselineDate      = "2024-04-08",
                        syncedAt          = "2024-04-08T10:30:00+09:00",
                        marketDataAt      = "2024-04-08T10:30:00+09:00",
                        timeLabel         = "現在値",
                        freshnessLevel    = FreshnessLevel.FRESH,
                        canPretendCurrent = true,
                    ),
                ),
            ),
            onRefresh = {},
            onBack    = {},
        )
    }
}
