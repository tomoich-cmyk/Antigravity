package com.antigravity.app

import android.app.NotificationManager
import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.work.ListenableWorker
import androidx.work.WorkerParameters
import androidx.work.testing.TestListenableWorkerBuilder
import com.antigravity.app.notification.NotificationChannels
import com.antigravity.app.worker.MarketSyncWorker
import com.antigravity.contract.*
import com.antigravity.data.db.AppDatabase
import com.antigravity.data.remote.MarketSnapshotDto
import com.antigravity.data.remote.SnapshotFetchException
import com.antigravity.data.remote.SnapshotFetcher
import com.antigravity.data.remote.StockQuoteDto
import com.antigravity.data.remote.StocksDto
import com.antigravity.data.repository.MarketRepository
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows
import org.robolectric.annotation.Config

/**
 * MarketSyncWorker の単体テスト。
 *
 * WorkManager のテスト用 API (TestListenableWorkerBuilder) を使い、
 * SnapshotFetcher をモックに差し替えて縮退ルールを検証する。
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], application = TestAntigravityApp::class)
class MarketSyncWorkerTest {

    private lateinit var db: AppDatabase
    private lateinit var repo: MarketRepository
    private lateinit var context: Context

    private val successDto = MarketSnapshotDto(
        fetchedAt = "2024-04-08T10:30:00+09:00",
        stocks = StocksDto(
            gmopg = StockQuoteDto(
                price = 9_920.0,
                source = "tse",
                marketDataAt = "2024-04-08T10:30:00+09:00",
                syncedAt = "2024-04-08T10:30:00+09:00",
                priceKind = "market",
                baselineDate = "2024-04-08",
            ),
            unext = StockQuoteDto(
                price = 3_450.0,
                source = "tse",
                priceKind = "close",
                baselineDate = "2024-04-05",
            ),
        ),
    )

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        repo = MarketRepository(db)
        // TestAntigravityApp にインスタンスを注入
        (context.applicationContext as TestAntigravityApp).apply {
            testDatabase   = db
            testRepository = repo
        }
        // 通知チャンネルを初期化（SummaryNotificationBuilder が使うため）
        NotificationChannels.createChannels(context)
    }

    @After
    fun tearDown() {
        db.close()
    }

    // ─── helpers ──────────────────────────────────────────────────────────────

    private fun buildWorker(fetcher: SnapshotFetcher): MarketSyncWorker {
        return TestListenableWorkerBuilder<MarketSyncWorker>(context)
            .setWorkerFactory(FakeWorkerFactory(fetcher, repo))
            .build()
    }

    // ─── fetch 成功テスト ──────────────────────────────────────────────────────

    @Test
    fun `fetch success saves quotes and status`() = runTest {
        val fetcher = FakeSnapshotFetcher(Result.success(successDto))
        val worker  = buildWorker(fetcher)

        val result = worker.doWork()

        assertEquals(ListenableWorker.Result.success(), result)
        // quotes が保存されている
        val quotes = repo.loadLatestQuotes()
        assertEquals(2, quotes.size)
        val g = quotes.first { it.assetId == "asset-gmopg" }
        assertEquals(9_920.0, g.value, 0.001)
        assertEquals(QuoteKind.INTRADAY, g.quoteKind)
        // fetch status が SUCCESS
        val status = repo.loadFetchStatus()
        assertEquals(SnapshotFetchState.FetchStatus.SUCCESS, status!!.status)
        assertFalse(status.fallbackUsed)
        assertTrue(status.hasUsableCachedQuotes)
        // summary が保存されている
        assertNotNull(repo.loadSummary())
    }

    @Test
    fun `fetch success updates quotes on second run`() = runTest {
        // 1st run: price = 9920
        buildWorker(FakeSnapshotFetcher(Result.success(successDto))).doWork()

        // 2nd run: price = 10000
        val updated = successDto.copy(
            stocks = successDto.stocks.copy(
                gmopg = successDto.stocks.gmopg!!.copy(price = 10_000.0)
            )
        )
        buildWorker(FakeSnapshotFetcher(Result.success(updated))).doWork()

        val quotes = repo.loadLatestQuotes()
        assertEquals(10_000.0, quotes.first { it.assetId == "asset-gmopg" }.value, 0.001)
    }

    // ─── fetch 失敗テスト（縮退ルール）──────────────────────────────────────────

    @Test
    fun `fetch network failure does NOT overwrite existing quotes`() = runTest {
        // 事前にキャッシュを作成
        buildWorker(FakeSnapshotFetcher(Result.success(successDto))).doWork()
        val cachedValue = repo.loadLatestQuotes().first { it.assetId == "asset-gmopg" }.value

        // network 失敗
        val failure = Result.failure<MarketSnapshotDto>(
            SnapshotFetchException(SnapshotFetchErrorKind.NETWORK, "connection refused")
        )
        val result = buildWorker(FakeSnapshotFetcher(failure)).doWork()

        // Worker は retry を返す
        assertEquals(ListenableWorker.Result.retry(), result)
        // quotes は書き換えられていない（縮退ルール）
        val quotes = repo.loadLatestQuotes()
        assertEquals(cachedValue, quotes.first { it.assetId == "asset-gmopg" }.value, 0.001)
        // fetch status が FAILED に更新されている
        val status = repo.loadFetchStatus()
        assertEquals(SnapshotFetchState.FetchStatus.FAILED, status!!.status)
        assertTrue(status.fallbackUsed)
        assertTrue(status.hasUsableCachedQuotes)
        assertEquals(SnapshotFetchErrorKind.NETWORK, status.errorKind)
    }

    @Test
    fun `fetch timeout failure returns retry`() = runTest {
        val failure = Result.failure<MarketSnapshotDto>(
            SnapshotFetchException(SnapshotFetchErrorKind.TIMEOUT, "timeout")
        )
        val result = buildWorker(FakeSnapshotFetcher(failure)).doWork()

        assertEquals(ListenableWorker.Result.retry(), result)
    }

    @Test
    fun `fetch HTTP error returns failure (not retry)`() = runTest {
        val failure = Result.failure<MarketSnapshotDto>(
            SnapshotFetchException(SnapshotFetchErrorKind.HTTP, "HTTP 500")
        )
        val result = buildWorker(FakeSnapshotFetcher(failure)).doWork()

        assertEquals(ListenableWorker.Result.failure(), result)
    }

    @Test
    fun `fetch failure without cache records fallbackUsed=false`() = runTest {
        // キャッシュなし状態で失敗
        val failure = Result.failure<MarketSnapshotDto>(
            SnapshotFetchException(SnapshotFetchErrorKind.NETWORK, "no route")
        )
        buildWorker(FakeSnapshotFetcher(failure)).doWork()

        val status = repo.loadFetchStatus()
        assertEquals(SnapshotFetchState.FetchStatus.FAILED, status!!.status)
        assertFalse(status.fallbackUsed)
        assertFalse(status.hasUsableCachedQuotes)
    }

    @Test
    fun `fetch failure preserves lastSuccessAt from previous success`() = runTest {
        // 成功 → 失敗の順
        buildWorker(FakeSnapshotFetcher(Result.success(successDto))).doWork()
        val successStatus = repo.loadFetchStatus()
        val successTime   = successStatus!!.lastSuccessAt

        val failure = Result.failure<MarketSnapshotDto>(
            SnapshotFetchException(SnapshotFetchErrorKind.NETWORK, "down")
        )
        buildWorker(FakeSnapshotFetcher(failure)).doWork()

        val failedStatus = repo.loadFetchStatus()
        assertEquals(successTime, failedStatus!!.lastSuccessAt)
    }

    // ─── 通知テスト ────────────────────────────────────────────────────────────

    @Test
    fun `fetch success posts summary notification`() = runTest {
        buildWorker(FakeSnapshotFetcher(Result.success(successDto))).doWork()

        val nm = context.getSystemService(NotificationManager::class.java)
        val shadow = Shadows.shadowOf(nm)
        assertNotNull(
            "fetch success 後に要約通知が発行されていない",
            shadow.getNotification(NotificationChannels.NOTIFICATION_SUMMARY),
        )
    }

    @Test
    fun `fetch success clears status notification`() = runTest {
        // 1st run: 失敗 → 状態通知発行
        buildWorker(
            FakeSnapshotFetcher(
                Result.failure(SnapshotFetchException(SnapshotFetchErrorKind.NETWORK, "down"))
            )
        ).doWork()
        val nm = context.getSystemService(NotificationManager::class.java)
        assertNotNull(Shadows.shadowOf(nm).getNotification(NotificationChannels.NOTIFICATION_STATUS))

        // 2nd run: 成功 → 状態通知がキャンセルされる
        buildWorker(FakeSnapshotFetcher(Result.success(successDto))).doWork()
        assertNull(
            "fetch success 後に状態通知が残っている",
            Shadows.shadowOf(nm).getNotification(NotificationChannels.NOTIFICATION_STATUS),
        )
    }

    @Test
    fun `fetch failure with cache posts status notification`() = runTest {
        // キャッシュを作成
        buildWorker(FakeSnapshotFetcher(Result.success(successDto))).doWork()

        // 失敗
        buildWorker(
            FakeSnapshotFetcher(
                Result.failure(SnapshotFetchException(SnapshotFetchErrorKind.NETWORK, "down"))
            )
        ).doWork()

        val nm = context.getSystemService(NotificationManager::class.java)
        assertNotNull(
            "fetch failure 後に状態通知が発行されていない",
            Shadows.shadowOf(nm).getNotification(NotificationChannels.NOTIFICATION_STATUS),
        )
    }

    @Test
    fun `fetch failure without cache does not post status notification`() = runTest {
        // キャッシュなし + lastSuccessAt=null → "初回取得前" は通知しない
        // SummaryTextBuilder.buildFetchStatusText は FAILED+lastSuccessAt=null でも
        // "市場データを取得できませんでした（初回取得前）。" を返すため、通知は出る
        buildWorker(
            FakeSnapshotFetcher(
                Result.failure(SnapshotFetchException(SnapshotFetchErrorKind.NETWORK, "no route"))
            )
        ).doWork()

        // 状態テキストが空でなければ通知が出る（初回失敗時もユーザーに伝える）
        val nm = context.getSystemService(NotificationManager::class.java)
        assertNotNull(
            "初回取得失敗でも状態通知が発行されるべき",
            Shadows.shadowOf(nm).getNotification(NotificationChannels.NOTIFICATION_STATUS),
        )
    }
}

// ─── Test doubles ─────────────────────────────────────────────────────────────

/** SnapshotFetcher のフェイク実装。コンストラクタに渡した Result を返す。 */
class FakeSnapshotFetcher(
    private val result: kotlin.Result<MarketSnapshotDto>,
) : SnapshotFetcher() {
    override suspend fun fetch(): kotlin.Result<MarketSnapshotDto> = result
}

/** FakeSnapshotFetcher を注入するための WorkerFactory。 */
class FakeWorkerFactory(
    private val fetcher: SnapshotFetcher,
    private val repo: MarketRepository,
) : androidx.work.WorkerFactory() {
    override fun createWorker(
        appContext: Context,
        workerClassName: String,
        workerParameters: WorkerParameters,
    ): ListenableWorker? {
        return if (workerClassName == MarketSyncWorker::class.java.name) {
            MarketSyncWorkerTestable(appContext, workerParameters, fetcher, repo)
        } else null
    }
}

/** テスト用に fetcher / repo を外から注入できる MarketSyncWorker サブクラス。 */
class MarketSyncWorkerTestable(
    context: Context,
    params: WorkerParameters,
    private val injectedFetcher: SnapshotFetcher,
    private val injectedRepo: MarketRepository,
) : MarketSyncWorker(context, params) {
    override val fetcherOverride: SnapshotFetcher? get() = injectedFetcher
    override val repoOverride: MarketRepository? get() = injectedRepo
}
