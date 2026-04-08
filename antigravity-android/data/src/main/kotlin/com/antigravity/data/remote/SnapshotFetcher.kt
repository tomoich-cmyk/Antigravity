package com.antigravity.data.remote

import com.antigravity.contract.SnapshotFetchErrorKind
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

/**
 * OkHttp で市場スナップショット API を取得する。
 *
 * エンドポイント: GET http://127.0.0.1:3001/market-snapshot
 * タイムアウト  : connect / read ともに 8 秒
 *
 * 戻り値:
 *   Result.success(MarketSnapshotDto) — 正常
 *   Result.failure(SnapshotFetchException) — ネットワーク・HTTP・パースエラー
 */
open class SnapshotFetcher(
    private val client: OkHttpClient = buildDefaultClient(),
    private val baseUrl: String = "http://127.0.0.1:3001",
) {

    private val json = Json { ignoreUnknownKeys = true }

    open suspend fun fetch(): Result<MarketSnapshotDto> = withContext(Dispatchers.IO) {
        runCatching {
            val request = Request.Builder()
                .url("$baseUrl/market-snapshot")
                .get()
                .build()

            val response = try {
                client.newCall(request).execute()
            } catch (e: java.net.SocketTimeoutException) {
                throw SnapshotFetchException(SnapshotFetchErrorKind.TIMEOUT, e.message, e)
            } catch (e: java.io.IOException) {
                throw SnapshotFetchException(SnapshotFetchErrorKind.NETWORK, e.message, e)
            }

            if (!response.isSuccessful) {
                throw SnapshotFetchException(
                    SnapshotFetchErrorKind.HTTP,
                    "HTTP ${response.code}: ${response.message}",
                )
            }

            val body = response.body?.string()
                ?: throw SnapshotFetchException(SnapshotFetchErrorKind.INVALID_PAYLOAD, "Empty body")

            try {
                json.decodeFromString<MarketSnapshotDto>(body)
            } catch (e: Exception) {
                throw SnapshotFetchException(SnapshotFetchErrorKind.INVALID_PAYLOAD, e.message, e)
            }
        }
    }

    companion object {
        fun buildDefaultClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(8, TimeUnit.SECONDS)
            .readTimeout(8, TimeUnit.SECONDS)
            .build()
    }
}

/** fetch 中に発生したエラーを種別付きで伝搬するための例外。 */
class SnapshotFetchException(
    val kind: SnapshotFetchErrorKind,
    message: String? = null,
    cause: Throwable? = null,
) : Exception(message ?: kind.name, cause)
