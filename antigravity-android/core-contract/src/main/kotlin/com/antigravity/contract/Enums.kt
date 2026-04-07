package com.antigravity.contract

// ─── 資産・価格種別 ───────────────────────────────────────────────────────────

enum class AssetClass {
    JP_STOCK,
    JP_ETF,
    JP_REIT,
    MUTUAL_FUND,
}

enum class QuoteKind {
    INTRADAY,
    CLOSE,
    NAV,
    REFERENCE,
}

// ─── ソース ───────────────────────────────────────────────────────────────────

enum class SourceId {
    MANUAL,
    SNAPSHOT_SERVER,
    BROKER_IMPORT,
    MOCK,
    CACHE,
}

enum class SourceMode {
    REALTIME,
    DELAYED,
    EOD,
    DAILY_NAV,
    MANUAL,
    MOCK,
    CACHE,
}

// ─── 鮮度 ─────────────────────────────────────────────────────────────────────

enum class FreshnessLevel {
    FRESH,
    LAGGING,
    STALE,
    UNKNOWN,
}

enum class FreshnessReason {
    MARKET_CLOSED,
    PROVIDER_DELAY,
    MANUAL_OLD,
    MISSING_MARKET_TIME,
    NAV_NOT_UPDATED,
    HOLIDAY_GAP,
    UNSUPPORTED,
    UNKNOWN,
}

// ─── 市場セッション ───────────────────────────────────────────────────────────

enum class MarketSession {
    PRE_OPEN,
    MORNING,
    LUNCH_BREAK,
    AFTERNOON,
    AFTER_CLOSE,
    HOLIDAY,
}

// ─── フェッチエラー ───────────────────────────────────────────────────────────

enum class SnapshotFetchErrorKind {
    NETWORK,
    TIMEOUT,
    HTTP,
    INVALID_PAYLOAD,
    ADAPTER_ERROR,
    EMPTY_SNAPSHOT,
    UNKNOWN,
}

// ─── 候補ブロック理由 ─────────────────────────────────────────────────────────

enum class CandidateBlockReason {
    MARKET_CONTEXT_MISSING,
    STALE_MARKET_DATA,
    SCORE_BELOW_THRESHOLD,
}
