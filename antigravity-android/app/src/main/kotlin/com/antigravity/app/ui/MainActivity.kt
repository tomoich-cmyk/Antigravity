package com.antigravity.app.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts

/**
 * メイン Activity — Phase 3-A は通知権限取得のみ。
 *
 * Phase 3-B でここに Compose setContent を追加する。
 *
 * 権限フロー (Android 13+):
 *   1. POST_NOTIFICATIONS が未承認 → システムダイアログを表示
 *   2. 承認 / 拒否どちらでも Worker は動く（拒否時は通知が出ないだけ）
 *   API 26-32 は権限不要のためスキップ。
 */
class MainActivity : ComponentActivity() {

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* 承認 / 拒否はどちらでも受け入れる — 通知は「あれば便利」機能 */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestNotificationPermissionIfNeeded()
        // Phase 3-B: setContent { AntigravityHomeScreen() }
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
