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
    }
  ],
  triggerRules: [
    { id: "trig-ab-s1", assetId: "asset-ab", direction: "sell", thresholdType: "gte", thresholdValue: 10200, quantityPlan: 500000, label: "10200 / 500000", isEnabled: true, isCompleted: false, cooldownUntil: null },
    { id: "trig-ab-s2", assetId: "asset-ab", direction: "sell", thresholdType: "gte", thresholdValue: 10400, quantityPlan: 500000, label: "10400 / 500000", isEnabled: true, isCompleted: false, cooldownUntil: null },
    { id: "trig-ab-s3", assetId: "asset-ab", direction: "sell", thresholdType: "gte", thresholdValue: 10500, quantityPlan: 500000, label: "10500 / 500000", isEnabled: true, isCompleted: false, cooldownUntil: null },
    { id: "trig-ab-s4", assetId: "asset-ab", direction: "sell", thresholdType: "gte", thresholdValue: 10700, quantityPlan: 500000, label: "10700 / 500000", isEnabled: true, isCompleted: false, cooldownUntil: null },
    { id: "trig-ab-s5", assetId: "asset-ab", direction: "sell", thresholdType: "gte", thresholdValue: 10800, quantityPlan: 500000, label: "10800 / 500000", isEnabled: true, isCompleted: false, cooldownUntil: null },
    
    { id: "trig-gmo-b1", assetId: "asset-gmopg", direction: "buy", thresholdType: "lte", thresholdValue: 8050, quantityPlan: 10, label: "8050 / 10", isEnabled: true, isCompleted: false, cooldownUntil: null },
    { id: "trig-gmo-b2", assetId: "asset-gmopg", direction: "buy", thresholdType: "lte", thresholdValue: 7950, quantityPlan: 25, label: "7950 / 25", isEnabled: true, isCompleted: false, cooldownUntil: null },
    { id: "trig-gmo-b3", assetId: "asset-gmopg", direction: "buy", thresholdType: "lte", thresholdValue: 7825, quantityPlan: 10, label: "7825 / 10", isEnabled: true, isCompleted: false, cooldownUntil: null },
    
    { id: "trig-gmo-s1", assetId: "asset-gmopg", direction: "sell", thresholdType: "gte", thresholdValue: 8900, quantityPlan: 25, label: "8900 / 25", isEnabled: true, isCompleted: false, cooldownUntil: null },
    
    { id: "trig-inv-a1", assetId: "asset-invesco", direction: "buy", thresholdType: "lte", thresholdValue: 8050, quantityPlan: 200000, label: "8050 / 20万円", isEnabled: true, isCompleted: false, cooldownUntil: null },
    { id: "trig-inv-a2", assetId: "asset-invesco", direction: "buy", thresholdType: "lte", thresholdValue: 7850, quantityPlan: 200000, label: "7850 / 20万円", isEnabled: true, isCompleted: false, cooldownUntil: null },

    { id: "trig-unx-s1", assetId: "asset-unext", direction: "sell", thresholdType: "range", thresholdValue: 1780, quantityPlan: 200, label: "1780 / 200", isEnabled: true, isCompleted: false, cooldownUntil: null }
  ],
  transactions: [],
  cashBuckets: [
    { id: "cash-total", name: "Total Cash", amount: 1200000, purpose: "totalCash", locked: false },
    { id: "cash-reserve", name: "Reserve Cash", amount: 200000, purpose: "reserveCash", locked: true },
    { id: "cash-investable", name: "Investable Cash", amount: 1000000, purpose: "investableCash", locked: false }
  ],
  notifications: []
};
