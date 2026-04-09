package com.antigravity.app.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import com.antigravity.app.ui.theme.AntigravityTheme

/**
 * メイン Activity。
 *
 * Phase 4 更新:
 *   - DiagnosticsViewModel / DiagnosticsScreen を追加
 *   - showDiagnostics フラグで Home ↔ Diagnostics を切り替え
 *   - BackHandler で Android バックキーに対応
 */
class MainActivity : ComponentActivity() {

    private val homeViewModel: HomeViewModel by viewModels {
        HomeViewModel.factory(this)
    }

    private val diagViewModel: DiagnosticsViewModel by viewModels {
        DiagnosticsViewModel.factory(this)
    }

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* 承認 / 拒否どちらでも受け入れる — 通知は「あれば便利」機能 */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestNotificationPermissionIfNeeded()

        setContent {
            AntigravityTheme {
                var showDiagnostics by rememberSaveable { mutableStateOf(false) }

                // 診断画面を開くたびにデータを最新化する
                LaunchedEffect(showDiagnostics) {
                    if (showDiagnostics) diagViewModel.load()
                }

                if (showDiagnostics) {
                    // ─── 診断画面 ────────────────────────────────────────────────
                    BackHandler { showDiagnostics = false }
                    val diagState by diagViewModel.uiState.collectAsState()
                    DiagnosticsScreen(
                        uiState   = diagState,
                        onRefresh = { diagViewModel.load() },
                        onBack    = { showDiagnostics = false },
                    )
                } else {
                    // ─── Home 画面 ────────────────────────────────────────────────
                    val homeState by homeViewModel.uiState.collectAsState()
                    val snackbarMessage by homeViewModel.snackbarMessage.collectAsState()
                    HomeScreen(
                        uiState         = homeState,
                        onRefresh       = { homeViewModel.requestRefresh(this) },
                        onDiagnostics   = { showDiagnostics = true },
                        snackbarMessage = snackbarMessage,
                        onSnackbarShown = { homeViewModel.clearSnackbar() },
                    )
                }
            }
        }
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
            ) {
                requestPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }
}
