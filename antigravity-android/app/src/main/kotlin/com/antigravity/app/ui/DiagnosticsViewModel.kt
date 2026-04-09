package com.antigravity.app.ui

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.antigravity.app.AntigravityApp
import com.antigravity.data.repository.MarketRepository
import com.antigravity.engine.FreshnessEvaluator
import com.antigravity.engine.MarketClock
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.ZonedDateTime

/**
 * 診断画面の ViewModel。
 *
 * Room の fetch_status + quote_snapshots を読み込み、
 * DiagnosticsUiState として emit する。
 *
 * HomeViewModel と同パターン (internal suspend fun loadNow) で
 * viewModelScope 競合なしに Robolectric テスト可能。
 */
class DiagnosticsViewModel(
    private val repo: MarketRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DiagnosticsUiState(isLoading = true))
    val uiState: StateFlow<DiagnosticsUiState> = _uiState.asStateFlow()

    init { load() }

    // ─── public API ───────────────────────────────────────────────────────────

    fun load() { viewModelScope.launch { loadNow() } }

    // ─── internal suspend API (テストから直接呼ぶ) ────────────────────────────

    internal suspend fun loadNow() {
        val now         = ZonedDateTime.now(MarketClock.JST)
        val fetchStatus = repo.loadFetchStatus()
        val quotes      = repo.loadLatestQuotes()

        val quoteRows = quotes.map { quote ->
            val fv = FreshnessEvaluator.evaluate(quote, now)
            DiagnosticsQuoteRow(
                assetId           = quote.assetId,
                displayName       = quote.assetId.toDisplayName(),
                quoteKind         = quote.quoteKind.name,
                baselineDate      = quote.baselineDate,
                syncedAt          = quote.syncedAt,
                marketDataAt      = quote.marketDataAt,
                timeLabel         = if (fv.canPretendCurrent) fv.priceLabel else fv.asOfLabel,
                freshnessLevel    = fv.level,
                canPretendCurrent = fv.canPretendCurrent,
            )
        }

        _uiState.value = DiagnosticsUiState(
            isLoading        = false,
            fetchStatusLabel = fetchStatus?.status?.name ?: "IDLE",
            lastSyncAt       = fetchStatus?.lastSuccessAt,
            lastAttemptAt    = fetchStatus?.lastAttemptAt,
            fallbackUsed     = fetchStatus?.fallbackUsed == true,
            errorKind        = fetchStatus?.errorKind?.name,
            errorMessage     = fetchStatus?.errorMessage,
            quoteRows        = quoteRows,
        )
    }

    // ─── factory ──────────────────────────────────────────────────────────────

    companion object {
        fun factory(context: Context): ViewModelProvider.Factory = viewModelFactory {
            initializer {
                DiagnosticsViewModel(
                    repo = (context.applicationContext as AntigravityApp).repository,
                )
            }
        }
    }
}
