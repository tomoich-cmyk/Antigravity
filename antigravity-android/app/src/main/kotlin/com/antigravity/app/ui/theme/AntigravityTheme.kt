package com.antigravity.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

/**
 * アプリ全体の Material3 テーマ。
 * Phase 3-B はデフォルトカラーを使用。カスタムカラーは Phase 4 以降で追加。
 */
@Composable
fun AntigravityTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) darkColorScheme() else lightColorScheme()
    MaterialTheme(
        colorScheme = colorScheme,
        typography  = Typography(),
        content     = content,
    )
}
