package com.antigravity.app

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.antigravity.app.ui.DiagnosticsViewModel
import com.antigravity.contract.*
import com.antigravity.data.db.AppDatabase
import com.antigravity.data.repository.MarketRepository
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * DiagnosticsViewModel 単体テスト。
 *
 * HomeViewModelTest と同パターン: in-memory Room + internal suspend loadNow() を直接呼ぶ。
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class DiagnosticsViewModelTest {

    private lateinit var db: AppDatabase
    private lateinit var repo: MarketRepository

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AppDatabase::class.java,
        ).allowMainThreadQueries().build()
        repo = MarketRepository(db)
    }

    @After
    fun tearDown() { db.close() }

    // ─── fixtures ─────────────────────────────────────────────────────────────

    private val intradayQuote = QuoteSnapshot(
        assetId      = "asset-gmopg",
        assetClass   = AssetClass.JP_STOCK,
        value        = 9_920.0,
        currency     = "JPY",
        quoteKind    = QuoteKind.INTRADAY,
        source       = QuoteSource(SourceId.SNAPSHOT_SERVER, SourceMode.REALTIME, "tse"),
        syncedAt     = "2024-04-08T10:30:00+09:00",
        marketDataAt = "2024-04-08T10:30:00+09:00",
        baselineDate = "2024-04-08",
    )

    private suspend fun buildViewModel(): DiagnosticsViewModel {
        val vm = DiagnosticsViewModel(repo)
        vm.loadNow()
        return vm
    }

    // ─── Tests ────────────────────────────────────────────────────────────────

    @Test
    fun `empty DB gives IDLE status and empty quoteRows`() = runTest {
        val vm = buildViewModel()
        val state = vm.uiState.value

        assertFalse(state.isLoading)
        assertEquals("IDLE", state.fetchStatusLabel)
        assertTrue(state.quoteRows.isEmpty())
        assertNull(state.lastSyncAt)
        assertFalse(state.fallbackUsed)
    }

    @Test
    fun `SUCCESS status is reflected correctly`() = runTest {
        repo.saveFetchStatus(SnapshotFetchState(
            status        = SnapshotFetchState.FetchStatus.SUCCESS,
            lastSuccessAt = "2024-04-08T10:30:00+09:00",
            lastAttemptAt = "2024-04-08T10:30:00+09:00",
        ))
        val vm = buildViewModel()
        val state = vm.uiState.value

        assertEquals("SUCCESS", state.fetchStatusLabel)
        assertEquals("2024-04-08T10:30:00+09:00", state.lastSyncAt)
        assertFalse(state.fallbackUsed)
        assertNull(state.errorKind)
    }

    @Test
    fun `FAILED status shows errorKind and fallbackUsed`() = runTest {
        repo.saveFetchStatus(SnapshotFetchState(
            status       = SnapshotFetchState.FetchStatus.FAILED,
            errorKind    = SnapshotFetchErrorKind.NETWORK,
            errorMessage = "timeout",
            fallbackUsed = true,
            hasUsableCachedQuotes = true,
            lastSuccessAt = "2024-04-07T10:00:00+09:00",
        ))
        val vm = buildViewModel()
        val state = vm.uiState.value

        assertEquals("FAILED", state.fetchStatusLabel)
        assertEquals("NETWORK", state.errorKind)
        assertEquals("timeout", state.errorMessage)
        assertTrue(state.fallbackUsed)
        assertEquals("2024-04-07T10:00:00+09:00", state.lastSyncAt)
    }

    @Test
    fun `quotes are mapped with correct quoteKind and baselineDate`() = runTest {
        repo.saveQuoteSnapshots(listOf(intradayQuote))
        val vm = buildViewModel()
        val row = vm.uiState.value.quoteRows.first()

        assertEquals("asset-gmopg", row.assetId)
        assertEquals("GMO-PG", row.displayName)
        assertEquals("INTRADAY", row.quoteKind)
        assertEquals("2024-04-08", row.baselineDate)
        assertEquals("2024-04-08T10:30:00+09:00", row.syncedAt)
        assertEquals("2024-04-08T10:30:00+09:00", row.marketDataAt)
    }

    @Test
    fun `load() refreshes data when called again`() = runTest {
        val vm = DiagnosticsViewModel(repo)
        vm.loadNow()
        assertTrue(vm.uiState.value.quoteRows.isEmpty())

        // 後から quote を追加して再読み込み
        repo.saveQuoteSnapshots(listOf(intradayQuote))
        vm.loadNow()

        assertEquals(1, vm.uiState.value.quoteRows.size)
    }
}
