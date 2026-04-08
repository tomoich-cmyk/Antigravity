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
 * Room から quotes / fetchStatus を読み込み、HomeUiState を構築して emit する。
 * FreshnessEvaluator の評価は ViewModel 層で行う（UI は評価結果だけを受け取る）。
 *
 * 縮退ルール連携:
 *   - isFallback / isFailure の状態は fetchStatus.fallbackUsed / status から取得
 *   - price の鮮度評価は「表示時刻」ベースで行う
 */
class HomeViewModel(
    private val repo: MarketRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState(isLoading = true))
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    // ─── public API ───────────────────────────────────────────────────────────

    /** DB を再読み込みして uiState を更新する。Worker 完了後にも呼べる。 */
    fun load() {
        viewModelScope.launch { loadNow() }
    }

    /**
     * 手動更新: WorkManager に one-time Worker をエンキューして即時同期を要求する。
     * Worker 完了後に再度 load() を呼ぶには、WorkInfo の observe が必要（Phase 3-C）。
     */
    fun requestRefresh(context: Context) {
        MarketSyncWorker.runOnce(context)
        // 楽観的に isLoading を立てる
        _uiState.value = _uiState.value.copy(isLoading = true)
        load()
    }

    // ─── internal suspend API (テストから直接呼ぶ) ────────────────────────────

    /**
     * DB を読み込んで _uiState を更新する suspend 関数。
     *
     * テストでは viewModelScope を介さず直接呼ぶことで、
     * Robolectric の Main ディスパッチャー制御問題を回避する。
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
            quoteRows   = rows,
            fetchStatus = fetchStatus,
            lastSyncAt  = fetchStatus?.lastSuccessAt,
            isLoading   = false,
        )
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
private fun String.toDisplayName(): String = when (this) {
    "asset-gmopg" -> "GMO-PG"
    "asset-unext" -> "U-NEXT"
    else          -> removePrefix("asset-").uppercase()
}
