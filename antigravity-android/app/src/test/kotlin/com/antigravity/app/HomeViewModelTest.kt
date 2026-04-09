package com.antigravity.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.antigravity.app.ui.HomeViewModel
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
 * HomeViewModel の単体テスト。
 *
 * UI (Compose) には依存せず、ViewModel ロジックのみを検証する。
 *
 * coroutine 戦略:
 *   viewModelScope.launch が Robolectric の Main Looper に依存するため、
 *   `loadNow()` (internal suspend) を直接呼ぶ方式でテストする。
 *   これにより setMain / advanceUntilIdle 制御が不要になる。
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class HomeViewModelTest {

    private lateinit var db: AppDatabase
    private lateinit var repo: MarketRepository

    // ─── fixture ─────────────────────────────────────────────────────────────

    private val gmopgQuote = QuoteSnapshot(
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

    private val unextQuote = QuoteSnapshot(
        assetId      = "asset-unext",
        assetClass   = AssetClass.JP_STOCK,
        value        = 3_450.0,
        currency     = "JPY",
        quoteKind    = QuoteKind.CLOSE,
        source       = QuoteSource(SourceId.SNAPSHOT_SERVER, SourceMode.EOD, "tse"),
        syncedAt     = "2024-04-08T10:30:00+09:00",
        marketDataAt = null,
        baselineDate = "2024-04-05",
    )

    // ─── setup / teardown ─────────────────────────────────────────────────────

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        repo = MarketRepository(db)
    }

    @After
    fun tearDown() {
        db.close()
    }

    // ─── helpers ──────────────────────────────────────────────────────────────

    /** ViewModel を作成し、loadNow() を直接呼んで初期状態を構築する。 */
    private suspend fun buildViewModel(): HomeViewModel {
        val vm = HomeViewModel(repo)
        vm.loadNow()
        return vm
    }

    // ─── tests ────────────────────────────────────────────────────────────────

    @Test
    fun `empty DB results in isEmpty=true and isLoading=false`() = runTest {
        val vm = buildViewModel()
        val state = vm.uiState.value

        assertFalse("isLoading should be false", state.isLoading)
        assertTrue("isEmpty should be true when no quotes", state.isEmpty)
        assertNull(state.fetchStatus)
        assertNull(state.lastSyncAt)
    }

    @Test
    fun `quotes are loaded and display names are mapped correctly`() = runTest {
        repo.saveQuoteSnapshots(listOf(gmopgQuote, unextQuote))

        val vm = buildViewModel()
        val state = vm.uiState.value

        assertEquals(2, state.quoteRows.size)

        val gmopg = state.quoteRows.first { it.assetId == "asset-gmopg" }
        assertEquals("GMO-PG", gmopg.displayName)
        assertTrue("price should end with 円", gmopg.price.endsWith("円"))
        assertTrue("price should contain comma or be short",
            gmopg.price.contains(",") || gmopg.price.length >= 5)

        val unext = state.quoteRows.first { it.assetId == "asset-unext" }
        assertEquals("U-NEXT", unext.displayName)
    }

    @Test
    fun `timeLabel is non-blank for each quote`() = runTest {
        repo.saveQuoteSnapshots(listOf(gmopgQuote))

        val vm = buildViewModel()
        val row = vm.uiState.value.quoteRows.first()

        assertTrue("timeLabel must not be blank", row.timeLabel.isNotBlank())
    }

    @Test
    fun `fetch SUCCESS sets isFailure=false and populates lastSyncAt`() = runTest {
        repo.saveQuoteSnapshots(listOf(gmopgQuote))
        repo.saveFetchStatus(
            SnapshotFetchState(
                status        = SnapshotFetchState.FetchStatus.SUCCESS,
                lastSuccessAt = "2024-04-08T10:30:00+09:00",
            )
        )

        val vm = buildViewModel()
        val state = vm.uiState.value

        assertFalse(state.isFailure)
        assertFalse(state.isFallback)
        assertEquals("2024-04-08T10:30:00+09:00", state.lastSyncAt)
    }

    @Test
    fun `fetch FAILED with fallback sets isFailure=true and keeps quotes`() = runTest {
        repo.saveQuoteSnapshots(listOf(gmopgQuote))
        repo.saveFetchStatus(
            SnapshotFetchState(
                status                = SnapshotFetchState.FetchStatus.FAILED,
                lastSuccessAt         = "2024-04-08T10:30:00+09:00",
                fallbackUsed          = true,
                hasUsableCachedQuotes = true,
                errorKind             = SnapshotFetchErrorKind.NETWORK,
            )
        )

        val vm = buildViewModel()
        val state = vm.uiState.value

        assertTrue(state.isFailure)
        assertTrue(state.isFallback)
        // fetch 失敗でも quotes は維持されている（縮退ルール）
        assertEquals(1, state.quoteRows.size)
    }

    @Test
    fun `loadNow() can be called multiple times reflecting updated data`() = runTest {
        repo.saveQuoteSnapshots(listOf(gmopgQuote))
        val vm = buildViewModel()
        assertEquals(1, vm.uiState.value.quoteRows.size)

        // 2 件に更新してから再ロード
        repo.saveQuoteSnapshots(listOf(gmopgQuote, unextQuote))
        vm.loadNow()

        assertEquals(2, vm.uiState.value.quoteRows.size)
    }

    // ─── Phase 4: refreshNow / snackbarMessage ────────────────────────────────

    @Test
    fun `refreshNow after SUCCESS sets snackbarMessage to 同期完了`() = runTest {
        repo.saveQuoteSnapshots(listOf(gmopgQuote))
        repo.saveFetchStatus(SnapshotFetchState(
            status = SnapshotFetchState.FetchStatus.SUCCESS,
            lastSuccessAt = "2024-04-08T10:30:00+09:00",
        ))
        val vm = HomeViewModel(repo)
        vm.refreshNow()

        assertEquals("同期完了", vm.snackbarMessage.value)
        assertFalse(vm.uiState.value.isRefreshing)
    }

    @Test
    fun `refreshNow after FAILED sets snackbarMessage to 同期失敗`() = runTest {
        repo.saveFetchStatus(SnapshotFetchState(
            status       = SnapshotFetchState.FetchStatus.FAILED,
            errorKind    = SnapshotFetchErrorKind.NETWORK,
            fallbackUsed = false,
        ))
        val vm = HomeViewModel(repo)
        vm.refreshNow()

        assertEquals("同期失敗", vm.snackbarMessage.value)
    }

    @Test
    fun `clearSnackbar nullifies snackbarMessage`() = runTest {
        repo.saveFetchStatus(SnapshotFetchState(
            status = SnapshotFetchState.FetchStatus.SUCCESS,
            lastSuccessAt = "2024-04-08T10:30:00+09:00",
        ))
        val vm = HomeViewModel(repo)
        vm.refreshNow()
        assertNotNull(vm.snackbarMessage.value)

        vm.clearSnackbar()
        assertNull(vm.snackbarMessage.value)
    }
}
