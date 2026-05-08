import type { AppState } from '../types';

export const initialData: AppState = {
  assets: [
    {
      id: "asset-ab",
      name: "AB",
      type: "fund",
      unitLabel: "口",
      currentPrice: 9780,
      averageCost: 10777,
      taxCostBasis: 10777,
      individualPrincipal: 10777,
      quantity: 5450000,
      marketValue: 5330100,
      unrealizedPnL: -543365,
      realizedPnL: 0,
      notes: ""
    },
    {
      id: "asset-gmopg",
      name: "GMOPG",
      type: "stock",
      unitLabel: "株",
      currentPrice: 8171,
      averageCost: 7799,
      quantity: 25,
      marketValue: 204275,
      unrealizedPnL: 9300,
      realizedPnL: 0,
      notes: "",
      symbol: "3769",
      maxBufferPct: 0.01,
      watchZoneEnabled: true,
      marketScoreEnabled: false,
    },
    {
      id: "asset-invesco",
      name: "インベスコ",
      type: "fund",
      unitLabel: "口",
      currentPrice: 8194,
      averageCost: 8566,
      quantity: 8970000,
      marketValue: 7350018,
      unrealizedPnL: -333684,
      realizedPnL: 0,
      notes: ""
    },
    {
      id: "asset-unext",
      name: "U-NEXT",
      type: "stock",
      unitLabel: "株",
      currentPrice: 1649,
      averageCost: 1920,
      quantity: 1000,
      marketValue: 1649000,
      unrealizedPnL: -271000,
      realizedPnL: 0,
      notes: "",
      symbol: "9418",
      maxBufferPct: 0.01,
      watchZoneEnabled: true,
      marketScoreEnabled: false,
    },
    // ─── WCM (新規追加) ────────────────────────────────────────────────────────
    {
      id: "asset-wcm",
      name: "WCM",
      type: "fund",
      unitLabel: "口",
      currentPrice: 13298,
      averageCost: 13298,
      taxCostBasis: 13298,
      individualPrincipal: 13298,
      quantity: 376000,
      marketValue: 500208,   // 376000口 × 13298円 / 10000
      unrealizedPnL: 0,
      realizedPnL: 0,
      notes: "WCM 世界成長株厳選ファンド（予想分配金提示型）"
    },
  ],
  triggerRules: [
    // ─── AB 強気ラダー (aggressive_sell_ladder) ───────────────────────────────
    // 下位ラインのキャッチアップ売りは行わない。
    // 10,890円以上を起点に小口利確、11,150円まで段階的に売却。
    { id: "trig-ab-s1", assetId: "asset-ab", direction: "sell", thresholdType: "gte", thresholdValue: 10890, quantityPlan: 500000,  label: "強気ラダー 10,890円 / 50万口",  isEnabled: true, isCompleted: false, cooldownUntil: null },
    { id: "trig-ab-s2", assetId: "asset-ab", direction: "sell", thresholdType: "gte", thresholdValue: 10920, quantityPlan: 500000,  label: "強気ラダー 10,920円 / 50万口",  isEnabled: true, isCompleted: false, cooldownUntil: null },
    { id: "trig-ab-s3", assetId: "asset-ab", direction: "sell", thresholdType: "gte", thresholdValue: 10950, quantityPlan: 750000,  label: "強気ラダー 10,950円 / 75万口",  isEnabled: true, isCompleted: false, cooldownUntil: null },
    { id: "trig-ab-s4", assetId: "asset-ab", direction: "sell", thresholdType: "gte", thresholdValue: 10980, quantityPlan: 750000,  label: "強気ラダー 10,980円 / 75万口",  isEnabled: true, isCompleted: false, cooldownUntil: null },
    { id: "trig-ab-s5", assetId: "asset-ab", direction: "sell", thresholdType: "gte", thresholdValue: 11020, quantityPlan: 1000000, label: "強気ラダー 11,020円 / 100万口", isEnabled: true, isCompleted: false, cooldownUntil: null },
    { id: "trig-ab-s6", assetId: "asset-ab", direction: "sell", thresholdType: "gte", thresholdValue: 11080, quantityPlan: 1000000, label: "強気ラダー 11,080円 / 100万口", isEnabled: true, isCompleted: false, cooldownUntil: null },
    { id: "trig-ab-s7", assetId: "asset-ab", direction: "sell", thresholdType: "gte", thresholdValue: 11150, quantityPlan: 950000,  label: "強気ラダー 11,150円 / 95万口",  isEnabled: true, isCompleted: false, cooldownUntil: null },

    // ─── GMOPG ────────────────────────────────────────────────────────────────
    { id: "trig-gmo-b1", assetId: "asset-gmopg", direction: "buy", thresholdType: "lte", thresholdValue: 8050, quantityPlan: 10, label: "8050 / 10", isEnabled: true, isCompleted: false, cooldownUntil: null },
    { id: "trig-gmo-b2", assetId: "asset-gmopg", direction: "buy", thresholdType: "lte", thresholdValue: 7950, quantityPlan: 25, label: "7950 / 25", isEnabled: true, isCompleted: false, cooldownUntil: null },
    { id: "trig-gmo-b3", assetId: "asset-gmopg", direction: "buy", thresholdType: "lte", thresholdValue: 7825, quantityPlan: 10, label: "7825 / 10", isEnabled: true, isCompleted: false, cooldownUntil: null },
    { id: "trig-gmo-s1", assetId: "asset-gmopg", direction: "sell", thresholdType: "gte", thresholdValue: 8900, quantityPlan: 25, label: "8900 / 25", isEnabled: true, isCompleted: false, cooldownUntil: null },

    // ─── インベスコ ──────────────────────────────────────────────────────────
    { id: "trig-inv-a1", assetId: "asset-invesco", direction: "buy", thresholdType: "lte", thresholdValue: 8050, quantityPlan: 200000, label: "8050 / 20万円", isEnabled: true, isCompleted: false, cooldownUntil: null },
    { id: "trig-inv-a2", assetId: "asset-invesco", direction: "buy", thresholdType: "lte", thresholdValue: 7850, quantityPlan: 200000, label: "7850 / 20万円", isEnabled: true, isCompleted: false, cooldownUntil: null },

    // ─── U-NEXT ───────────────────────────────────────────────────────────────
    { id: "trig-unx-s1", assetId: "asset-unext", direction: "sell", thresholdType: "range", thresholdValue: 1780, quantityPlan: 200, label: "1780 / 200", isEnabled: true, isCompleted: false, cooldownUntil: null },
  ],
  transactions: [],
  cashBuckets: [
    { id: "cash-total",      name: "Total Cash",      amount: 1200000, purpose: "totalCash",      locked: false },
    { id: "cash-reserve",    name: "Reserve Cash",    amount: 200000,  purpose: "reserveCash",    locked: true  },
    { id: "cash-investable", name: "Investable Cash", amount: 1000000, purpose: "investableCash", locked: false },
  ],
  notifications: [],

  // ─── 再配分ルール ─────────────────────────────────────────────────────────
  allocationRules: [
    {
      id: "alloc-ab-sell",
      source: "ab_sell",
      label: "AB売却金 再配分",
      slices: [
        { assetId: "asset-wcm",     label: "WCM",      pct: 50 },
        { assetId: "asset-invesco", label: "インベスコ", pct: 50 },
      ],
      schedule: [
        { label: "受渡週",   pct: 50 },
        { label: "翌週",     pct: 30 },
        { label: "翌々週",   pct: 20 },
      ],
    },
    {
      id: "alloc-stock-sell",
      source: "stock_sell",
      label: "株式売却金 再配分",
      slices: [
        { assetId: "cash",          label: "現金",      pct: 35 },
        { assetId: "asset-wcm",     label: "WCM",      pct: 39 },
        { assetId: "asset-invesco", label: "インベスコ", pct: 26 },
      ],
    },
    {
      id: "alloc-annual",
      source: "annual_investment",
      label: "年間追加投資",
      slices: [
        { assetId: "asset-wcm",     label: "WCM",      pct: 40 },
        { assetId: "asset-invesco", label: "インベスコ", pct: 60 },
      ],
      monthlyAmount: 125000,
    },
  ],
};
