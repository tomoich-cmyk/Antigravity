package com.antigravity.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.antigravity.contract.*
import com.antigravity.data.db.AppDatabase
import com.antigravity.data.db.SummaryCacheEntity
import com.antigravity.data.repository.MarketRepository
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class MarketRepositoryTest {

    private lateinit var db: AppDatabase
    private lateinit var repo: MarketRepository

    // ─── fixtures ─────────────────────────────────────────────────────────────

    private val gmopg = QuoteSnapshot(
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

    private val unext = QuoteSnapshot(
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

    // ─── QuoteSnapshot tests ──────────────────────────────────────────────────

    @Test
    fun `saveQuoteSnapshots and loadLatestQuotes round-trips correctly`() = runTest {
        repo.saveQuoteSnapshots(listOf(gmopg, unext))

        val loaded = repo.loadLatestQuotes()

        assertEquals(2, loaded.size)
        val g = loaded.first { it.assetId == "asset-gmopg" }
        assertEquals(9_920.0, g.value, 0.001)
        assertEquals(QuoteKind.INTRADAY, g.quoteKind)
        assertEquals("2024-04-08T10:30:00+09:00", g.syncedAt)
        assertEquals("2024-04-08T10:30:00+09:00", g.marketDataAt)

        val u = loaded.first { it.assetId == "asset-unext" }
        assertEquals(3_450.0, u.value, 0.001)
        assertEquals(QuoteKind.CLOSE, u.quoteKind)
        assertNull(u.marketDataAt)
    }

    @Test
    fun `saveQuoteSnapshots replaces previous data`() = runTest {
        repo.saveQuoteSnapshots(listOf(gmopg))
        assertEquals(1, repo.loadLatestQuotes().size)

        val updated = gmopg.copy(value = 10_000.0)
        repo.saveQuoteSnapshots(listOf(updated))

        val loaded = repo.loadLatestQuotes()
        assertEquals(1, loaded.size)
        assertEquals(10_000.0, loaded[0].value, 0.001)
    }

    @Test
    fun `fetch failure does not overwrite existing quotes`() = runTest {
        // 1. fetch 成功 → 保存
        repo.saveQuoteSnapshots(listOf(gmopg))

        // 2. fetch 失敗 → saveQuoteSnapshots を呼ばない（縮退ルール）
        val failedStatus = SnapshotFetchState(
            status         = SnapshotFetchState.FetchStatus.FAILED,
            lastAttemptAt  = "2024-04-08T11:00:00+09:00",
            lastSuccessAt  = "2024-04-08T10:30:00+09:00",
            lastErrorAt    = "2024-04-08T11:00:00+09:00",
            errorKind      = SnapshotFetchErrorKind.NETWORK,
            fallbackUsed   = true,
            hasUsableCachedQuotes = true,
        )
        repo.saveFetchStatus(failedStatus)
        // ← ここで saveQuoteSnapshots を呼ばない

        // 3. 価格は前回値のまま
        val loaded = repo.loadLatestQuotes()
        assertEquals(1, loaded.size)
        assertEquals(9_920.0, loaded[0].value, 0.001)

        // 4. フェッチステータスは FAILED
        val status = repo.loadFetchStatus()
        assertNotNull(status)
        assertEquals(SnapshotFetchState.FetchStatus.FAILED, status!!.status)
        assertTrue(status.fallbackUsed)
        assertTrue(status.hasUsableCachedQuotes)
    }

    @Test
    fun `hasQuotes returns false when empty`() = runTest {
        assertFalse(repo.hasQuotes())
    }

    @Test
    fun `hasQuotes returns true after saving`() = runTest {
        repo.saveQuoteSnapshots(listOf(gmopg))
        assertTrue(repo.hasQuotes())
    }

    // ─── FetchStatus tests ────────────────────────────────────────────────────

    @Test
    fun `saveFetchStatus and loadFetchStatus round-trips correctly`() = runTest {
        val state = SnapshotFetchState(
            status        = SnapshotFetchState.FetchStatus.SUCCESS,
            lastAttemptAt = "2024-04-08T10:30:00+09:00",
            lastSuccessAt = "2024-04-08T10:30:00+09:00",
        )
        repo.saveFetchStatus(state)

        val loaded = repo.loadFetchStatus()
        assertNotNull(loaded)
        assertEquals(SnapshotFetchState.FetchStatus.SUCCESS, loaded!!.status)
        assertEquals("2024-04-08T10:30:00+09:00", loaded.lastSuccessAt)
        assertNull(loaded.errorKind)
        assertFalse(loaded.fallbackUsed)
    }

    @Test
    fun `loadFetchStatus returns null when not saved`() = runTest {
        assertNull(repo.loadFetchStatus())
    }

    @Test
    fun `saveFetchStatus upserts single row`() = runTest {
        val first = SnapshotFetchState(
            status = SnapshotFetchState.FetchStatus.SUCCESS,
            lastSuccessAt = "2024-04-08T09:00:00+09:00",
        )
        repo.saveFetchStatus(first)

        val second = SnapshotFetchState(
            status = SnapshotFetchState.FetchStatus.FAILED,
            lastErrorAt = "2024-04-08T10:00:00+09:00",
            errorKind = SnapshotFetchErrorKind.TIMEOUT,
        )
        repo.saveFetchStatus(second)

        val loaded = repo.loadFetchStatus()
        assertEquals(SnapshotFetchState.FetchStatus.FAILED, loaded!!.status)
        assertEquals(SnapshotFetchErrorKind.TIMEOUT, loaded.errorKind)
    }

    // ─── SummaryCache tests ───────────────────────────────────────────────────

    @Test
    fun `saveSummary and loadSummary round-trips correctly`() = runTest {
        val entity = SummaryCacheEntity(
            summaryText = "asset-gmopg: 現在値 9,920円\nasset-unext: 4/5 終値 3,450円",
            generatedAt = "2024-04-08T10:31:00+09:00",
            sessionType = "MORNING",
        )
        repo.saveSummary(entity)

        val loaded = repo.loadSummary()
        assertNotNull(loaded)
        assertEquals("asset-gmopg: 現在値 9,920円\nasset-unext: 4/5 終値 3,450円", loaded!!.summaryText)
        assertEquals("MORNING", loaded.sessionType)
    }

    @Test
    fun `loadSummary returns null when not saved`() = runTest {
        assertNull(repo.loadSummary())
    }

    @Test
    fun `saveSummary upserts single row`() = runTest {
        repo.saveSummary(SummaryCacheEntity(summaryText = "old", generatedAt = "2024-04-08T09:00:00+09:00"))
        repo.saveSummary(SummaryCacheEntity(summaryText = "new", generatedAt = "2024-04-08T10:00:00+09:00"))

        val loaded = repo.loadSummary()
        assertEquals("new", loaded!!.summaryText)
    }
}
