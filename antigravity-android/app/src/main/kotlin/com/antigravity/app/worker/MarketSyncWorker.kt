package com.antigravity.app.worker

import android.content.Context
import androidx.work.*
import com.antigravity.app.AntigravityApp
import com.antigravity.app.notification.SummaryNotificationBuilder
import com.antigravity.app.widget.AntigravityWidget
import androidx.glance.appwidget.updateAll
import com.antigravity.contract.SnapshotFetchErrorKind
import com.antigravity.contract.SnapshotFetchState
import com.antigravity.data.db.SummaryCacheEntity
import com.antigravity.data.remote.SnapshotAdapter
import com.antigravity.data.remote.SnapshotFetchException
import com.antigravity.data.remote.SnapshotFetcher
import com.antigravity.data.repository.MarketRepository
import com.antigravity.engine.MarketClock
import com.antigravity.engine.SummaryTextBuilder
import java.time.ZonedDateTime
import java.util.concurrent.TimeUnit

/**
 * 市場スナップショット定期同期 Worker。
 *
 * 処理フロー:
 *   1. fetch → 失敗なら縮退ルールへ
 *   2. adapt (DTO → domain)
 *   3. saveQuoteSnapshots (fetch 成功時のみ)
 *   4. saveFetchStatus (成功・失敗どちらでも保存)
 *   5. summary 生成 → saveSummary
 *   6. (将来) 通知発行
 *
 * 縮退ルール (Phase 2 核心):
 *   fetch が失敗した場合は saveQuoteSnapshots を呼ばない。
 *   既存の quote_snapshots はそのまま維持され、price state の書き換えはゼロ。
 */
open class MarketSyncWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    /**
     * テストで差し替えるために open にする。
     * 本番は null → AntigravityApp.repository を使う。
     */
    open val repoOverride: MarketRepository? get() = null

    /** テストで差し替えるために open にする。本番は null → デフォルト fetcher を使う。 */
    open val fetcherOverride: SnapshotFetcher? get() = null

    private val repo: MarketRepository by lazy {
        repoOverride ?: (applicationContext as AntigravityApp).repository
    }

    private val fetcher: SnapshotFetcher by lazy {
        fetcherOverride ?: SnapshotFetcher()
    }

    override suspend fun doWork(): Result {
        val now = ZonedDateTime.now(MarketClock.JST)
        val nowStr = now.toString()

        // ─── 1. Fetch ─────────────────────────────────────────────────────────
        val fetchResult = fetcher.fetch()

        if (fetchResult.isFailure) {
            // ─── fetch 失敗: 縮退ルール ───────────────────────────────────────
            val ex = fetchResult.exceptionOrNull()
            val errorKind = (ex as? SnapshotFetchException)?.kind
                ?: SnapshotFetchErrorKind.UNKNOWN

            val prevStatus = repo.loadFetchStatus()
            val hasCache   = repo.hasQuotes()

            val failedStatus = SnapshotFetchState(
                status                = SnapshotFetchState.FetchStatus.FAILED,
                lastAttemptAt         = nowStr,
                lastSuccessAt         = prevStatus?.lastSuccessAt,   // 前回成功時刻を引き継ぐ
                lastErrorAt           = nowStr,
                errorKind             = errorKind,
                errorMessage          = ex?.message,
                fallbackUsed          = hasCache,                     // キャッシュあれば fallback 中
                hasUsableCachedQuotes = hasCache,
            )
            repo.saveFetchStatus(failedStatus)
            // ← saveQuoteSnapshots は呼ばない（縮退ルール: price state 書き換えゼロ）

            // ─── 状態通知: fallback 中であることをユーザーに伝える ───────────
            val statusText = SummaryTextBuilder.buildFetchStatusText(failedStatus)
            SummaryNotificationBuilder.postStatusNotification(applicationContext, statusText)

            // キャッシュがあれば summary を再生成して保存（通知テキスト更新のため）
            // ウィジェットも fallback 状態で再描画する
            if (hasCache) {
                regenerateSummary(failedStatus, now)
                AntigravityWidget().updateAll(applicationContext)
            }

            // リトライ可否: NETWORK / TIMEOUT はリトライ、それ以外は諦める
            return when (errorKind) {
                SnapshotFetchErrorKind.NETWORK,
                SnapshotFetchErrorKind.TIMEOUT -> Result.retry()
                else -> Result.failure()
            }
        }

        // ─── 2. Adapt ─────────────────────────────────────────────────────────
        val dto = fetchResult.getOrThrow()
        val quotes = try {
            SnapshotAdapter.adapt(dto)
        } catch (e: Exception) {
            val prevStatus = repo.loadFetchStatus()
            repo.saveFetchStatus(
                SnapshotFetchState(
                    status        = SnapshotFetchState.FetchStatus.FAILED,
                    lastAttemptAt = nowStr,
                    lastSuccessAt = prevStatus?.lastSuccessAt,
                    lastErrorAt   = nowStr,
                    errorKind     = SnapshotFetchErrorKind.ADAPTER_ERROR,
                    errorMessage  = e.message,
                    fallbackUsed  = repo.hasQuotes(),
                    hasUsableCachedQuotes = repo.hasQuotes(),
                )
            )
            return Result.failure()
        }

        if (quotes.isEmpty()) {
            val prevStatus = repo.loadFetchStatus()
            repo.saveFetchStatus(
                SnapshotFetchState(
                    status        = SnapshotFetchState.FetchStatus.FAILED,
                    lastAttemptAt = nowStr,
                    lastSuccessAt = prevStatus?.lastSuccessAt,
                    lastErrorAt   = nowStr,
                    errorKind     = SnapshotFetchErrorKind.EMPTY_SNAPSHOT,
                    fallbackUsed  = repo.hasQuotes(),
                    hasUsableCachedQuotes = repo.hasQuotes(),
                )
            )
            return Result.failure()
        }

        // ─── 3. Save quotes (fetch 成功時のみ) ────────────────────────────────
        repo.saveQuoteSnapshots(quotes)

        // ─── 4. Save fetch status ─────────────────────────────────────────────
        val successStatus = SnapshotFetchState(
            status                = SnapshotFetchState.FetchStatus.SUCCESS,
            lastAttemptAt         = nowStr,
            lastSuccessAt         = nowStr,
            fallbackUsed          = false,
            hasUsableCachedQuotes = true,
        )
        repo.saveFetchStatus(successStatus)

        // ─── 5. Generate & save summary ───────────────────────────────────────
        val session = MarketClock.getSession(now)
        val summaryText = SummaryTextBuilder.generateSummaryText(
            quotes      = quotes,
            now         = now,
            fetchStatus = successStatus,
        )
        repo.saveSummary(
            SummaryCacheEntity(
                summaryText = summaryText,
                generatedAt = nowStr,
                sessionType = session.name,
            )
        )

        // ─── 要約通知を更新、状態通知（前回 failure があれば）をクリア ─────
        SummaryNotificationBuilder.postSummaryNotification(applicationContext, summaryText)
        SummaryNotificationBuilder.cancelStatusNotification(applicationContext)

        // ─── ウィジェットを同期完了データで更新 ─────────────────────────────
        AntigravityWidget().updateAll(applicationContext)

        return Result.success()
    }

    /** fetch 失敗時にキャッシュ済み quotes でサマリーを再生成する。 */
    private suspend fun regenerateSummary(
        failedStatus: SnapshotFetchState,
        now: ZonedDateTime,
    ) {
        val cachedQuotes = repo.loadLatestQuotes()
        if (cachedQuotes.isEmpty()) return
        val session = MarketClock.getSession(now)
        val summaryText = SummaryTextBuilder.generateSummaryText(
            quotes      = cachedQuotes,
            now         = now,
            fetchStatus = failedStatus,
        )
        repo.saveSummary(
            SummaryCacheEntity(
                summaryText = summaryText,
                generatedAt = now.toString(),
                sessionType = session.name,
            )
        )
    }

    companion object {
        const val WORK_NAME_PERIODIC = "MarketSyncWorker_periodic"
        const val WORK_NAME_ONE_SHOT = "MarketSyncWorker_oneShot"

        /**
         * 15 分間隔の定期同期をスケジュール。
         * 既に登録済みの場合は KEEP（多重登録防止）。
         */
        fun schedulePeriodicSync(context: Context) {
            val request = PeriodicWorkRequestBuilder<MarketSyncWorker>(
                15, TimeUnit.MINUTES,
            )
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME_PERIODIC,
                ExistingPeriodicWorkPolicy.KEEP,
                request,
            )
        }

        /**
         * 即時 one-time 同期（起動時・手動更新用）。
         * ネットワーク制約なし（ユーザーが明示的に要求した場合は即実行）。
         */
        fun runOnce(context: Context) {
            val request = OneTimeWorkRequestBuilder<MarketSyncWorker>()
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                WORK_NAME_ONE_SHOT,
                ExistingWorkPolicy.REPLACE,
                request,
            )
        }
    }
}
