package com.antigravity.app.ui

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.antigravity.app.AntigravityApp
import com.antigravity.app.worker.MarketSyncWorker
import com.antigravity.data.repository.MarketRepository
import com.antigravity.engine.FreshnessEvaluator
import com.antigravity.engine.MarketClock
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.ZonedDateTime

/**
 * Home 画面の ViewModel。
 *
 * Phase 4 追加:
 *   - isRefreshing: Pull-to-Refresh インジケーター制御
 *   - snackbarMessage: 手動更新完了後の Snackbar メッセージ (one-shot)
 *   - refreshNow(): PTR / 手動更新専用 suspend 関数 (テスト可能)
 */
class HomeViewModel(
    private val repo: MarketRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState(isLoading = true))
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    /** 手動更新完了後の Snackbar メッセージ。UI 表示後に clearSnackbar() で null に戻す。 */
    private val _snackbarMessage = MutableStateFlow<String?>(null)
    val snackbarMessage: StateFlow<String?> = _snackbarMessage.asStateFlow()

    init { load() }

    // ─── public API ───────────────────────────────────────────────────────────

    fun load() { viewModelScope.launch { loadNow() } }

    /**
     * 手動更新: WorkManager に one-time Worker をエンキューして即時同期を要求する。
     * PTR インジケーターを表示し、DB 再読み後に Snackbar メッセージを emit する。
     */
    fun requestRefresh(context: Context) {
        MarketSyncWorker.runOnce(context)
        viewModelScope.launch { refreshNow() }
    }

    /** Snackbar 表示後に呼ぶ。二重表示防止のためクリアする。 */
    fun clearSnackbar() { _snackbarMessage.value = null }

    // ─── internal suspend API (テストから直接呼ぶ) ────────────────────────────

    /**
     * DB を読み込んで _uiState を更新する suspend 関数。
     * viewModelScope を介さず直接呼ぶことで Robolectric 制御問題を回避する。
     */
    internal suspend fun loadNow() {
        val now         = ZonedDateTime.now(MarketClock.JST)
        val quotes      = repo.loadLatestQuotes()
        val fetchStatus = repo.loadFetchStatus()

        val rows = quotes.map { quote ->
            val fv = FreshnessEvaluator.evaluate(quote, now)
            QuoteRowData(
                assetId           = quote.assetId,
                displayName       = quote.assetId.toDisplayName(),
                price             = "%,d円".format(quote.value.toLong()),
                timeLabel         = if (fv.canPretendCurrent) fv.priceLabel else fv.asOfLabel,
                freshnessLevel    = fv.level,
                canPretendCurrent = fv.canPretendCurrent,
            )
        }

        _uiState.value = HomeUiState(
            quoteRows    = rows,
            fetchStatus  = fetchStatus,
            lastSyncAt   = fetchStatus?.lastSuccessAt,
            isLoading    = false,
            isRefreshing = false,   // ロード完了で PTR インジケーターを消す
        )
    }

    /**
     * Pull-to-Refresh / 手動更新用。
     * isRefreshing を立て→ loadNow() → 完了後に Snackbar を emit する。
     */
    internal suspend fun refreshNow() {
        _uiState.value = _uiState.value.copy(isRefreshing = true)
        loadNow()   // 完了時に isRefreshing = false を内部でセット
        _snackbarMessage.value = if (_uiState.value.isFailure) "同期失敗" else "同期完了"
    }

    // ─── factory ──────────────────────────────────────────────────────────────

    companion object {
        fun factory(context: Context): ViewModelProvider.Factory = viewModelFactory {
            initializer {
                HomeViewModel(
                    repo = (context.applicationContext as AntigravityApp).repository,
                )
            }
        }
    }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/** assetId を画面表示名に変換する。 */
internal fun String.toDisplayName(): String = when (this) {
    "asset-gmopg"   -> "GMO-PG"
    "asset-unext"   -> "U-NEXT"
    "asset-ab"      -> "AB"
    "asset-invesco" -> "インベスコ"
    else            -> removePrefix("asset-").uppercase()
}
