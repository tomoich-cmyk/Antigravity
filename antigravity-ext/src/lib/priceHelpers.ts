import type { PriceSource, PriceKind, AssetPriceMeta } from '../types/viewModels';

export const PRICE_SOURCE_LABEL: Record<PriceSource, string> = {
  manual: "手動",
  api: "同期済",
  preview: "確認前",
  fallback: "代替値",
};

export const PRICE_KIND_LABEL: Record<PriceKind, string> = {
  market: "現在値",
  official: "基準価額",
  reference: "参考価格",
  snapshot: "前回取得値",
  close: "終値",
};

export function formatYen(value?: number): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toLocaleString()}円`;
}

export function formatSignedYen(value?: number): string {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString()}円`;
}

function hoursDiffFromNow(iso?: string): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diffMs = Date.now() - t;
  return Math.floor(diffMs / (1000 * 60 * 60));
}

export function formatSyncedAtLabel(syncedAt?: string): string {
  const h = hoursDiffFromNow(syncedAt);
  if (h == null) return "更新: 不明";
  if (h < 1) return "更新: 1時間以内";
  if (h < 24) return `更新: ${h}時間前`;
  if (h < 48) return "更新: 昨日";
  return `更新: ${Math.floor(h / 24)}日前`;
}

export function formatMarketDataAtLabel(
  marketDataAt?: string
): string {
  if (!marketDataAt) return "市場時刻: 不明";

  const d = new Date(marketDataAt);
  if (Number.isNaN(d.getTime())) return "市場時刻: 不明";

  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");

  const now = new Date();
  const isSameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  return isSameDay ? `市場時刻: ${hh}:${mm}` : `市場時刻: 前営業日 ${hh}:${mm}`;
}

export function formatBaselineDate(baselineDate?: string): string {
  if (!baselineDate) return "基準日: 不明";

  // YYYY-MM-DD
  const parts = baselineDate.split('-');
  if (parts.length !== 3) return `基準日: ${baselineDate}`;

  const d = new Date(`${baselineDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return `基準日: ${baselineDate}`;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffTime = today.getTime() - d.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return `基準日: 当日 ${baselineDate}`;
  if (diffDays === 1) return `基準日: 前営業日 ${baselineDate}`;
  
  return `基準日: ${baselineDate}`;
}

export function shouldShowMarketDataAt(meta: AssetPriceMeta, assetClass: "stock" | "fund"): boolean {
  if (assetClass === "stock") return !!meta.marketDataAt;
  return false;
}

export function staleLabel(meta: AssetPriceMeta): string | null {
  return meta.isStale ? "古い値" : null;
}

/**
 * 鮮度判定 (Sprint 5-2 リファイン)
 */
export function computeIsStale(input: {
  assetClass: "stock" | "fund";
  priceKind: PriceKind;
  syncedAt?: string;
  marketDataAt?: string;
  baselineDate?: string;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();

  // 1. 同期時刻が24時間以上前なら無条件で stale
  const syncedHours = hoursDiffFromNow(input.syncedAt);
  if (syncedHours != null && syncedHours >= 24) return true;

  // 2. 市場時刻に基づく判定
  if (input.assetClass === "stock" && input.marketDataAt) {
    const md = new Date(input.marketDataAt);
    if (Number.isNaN(md.getTime())) return true;

    const sameDay =
      md.getFullYear() === now.getFullYear() &&
      md.getMonth() === now.getMonth() &&
      md.getDate() === now.getDate();

    const after1530 = now.getHours() > 15 || (now.getHours() === 15 && now.getMinutes() >= 30);
    if (after1530 && !sameDay) return true;
  }

  // 3. 投信: 基準日が2営業日相当以上なければ stale
  if (input.assetClass === "fund" && input.baselineDate) {
    const bd = new Date(`${input.baselineDate}T00:00:00`);
    if (!Number.isNaN(bd.getTime())) {
      const diffMs = now.getTime() - bd.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (diffDays >= 2) return true;
    }
  }

  return false;
}

export function buildPriceMetaLines(
  assetClass: "stock" | "fund",
  meta: AssetPriceMeta,
): string[] {
  const lines: string[] = [];
  
  if (assetClass === "fund") {
    // 投信: 基準日 -> 更新時刻
    lines.push(formatBaselineDate(meta.baselineDate));
    lines.push(formatSyncedAtLabel(meta.syncedAt));
  } else {
    // 株式: 市場時刻 -> 更新時刻
    lines.push(formatMarketDataAtLabel(meta.marketDataAt));
    lines.push(formatSyncedAtLabel(meta.syncedAt));
  }

  // 古い値フラグ
  const stale = staleLabel(meta);
  if (stale) lines.push(stale);

  return lines;
}
