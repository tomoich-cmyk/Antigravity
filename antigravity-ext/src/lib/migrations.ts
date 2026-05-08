import type { AppState, Asset, AssetPriceState, AllocationRule } from '../types';

export const CURRENT_SCHEMA_VERSION = 4;

export function buildDefaultPriceState(asset: Asset): AssetPriceState {
  return {
    assetId: asset.id,
    price: asset.currentPrice,
    displayPrice: asset.currentPrice,
    officialPrice: asset.type === 'fund' ? asset.currentPrice : undefined,
    priceKind: asset.type === 'fund' ? 'official' : 'market',
    source: asset.priceSource || 'auto',
    priceSource: asset.priceSource || 'auto',
    updatedAt: asset.lastPriceUpdatedAt || Date.now(),
    lastOfficialUpdatedAt: asset.type === 'fund' ? (asset.lastPriceUpdatedAt || Date.now()) : undefined,
  };
}

export function migrateState(state: AppState): AppState {
  const version = state.version || 1;

  if (version >= CURRENT_SCHEMA_VERSION) {
    return state;
  }

  // v1 -> v2 migration
  if (version < 2) {
    console.log('Migrating state to v2...');
    try {
      if (!state.priceState) {
        state.priceState = {};
      }

      const migratedPriceState: Record<string, AssetPriceState> = { ...state.priceState };

      if (state.assets) {
        for (const asset of state.assets) {
          if (!migratedPriceState[asset.id]) {
            migratedPriceState[asset.id] = buildDefaultPriceState(asset);
          } else {
            const ps = migratedPriceState[asset.id];
            if (ps.priceKind === undefined) {
               ps.priceKind = asset.type === 'fund' ? 'official' : 'market';
            }
            if (ps.displayPrice === undefined) {
               ps.displayPrice = ps.price;
            }
            if (asset.type === 'fund' && ps.officialPrice === undefined) {
               ps.officialPrice = ps.price;
               ps.lastOfficialUpdatedAt = ps.updatedAt;
            }
          }
        }
      }

      state.priceState = migratedPriceState;
      state.version = 2;
    } catch (e) {
      console.error('Migration to v2 failed! Fallback to partial state.', e);
    }
  }

  // v3 migration: Inject symbols for existing assets to support automated sync
  if (version < 3) {
    console.log('Migrating state to v3 (symbol injection)...');
    const symbolMap: Record<string, string> = {
      'asset-gmopg': '3769',
      'asset-unext': '9418'
    };

    if (state.assets) {
      state.assets = state.assets.map(asset => {
        if (!asset.symbol && symbolMap[asset.id]) {
          return { ...asset, symbol: symbolMap[asset.id] };
        }
        return asset;
      });
    }
    state.version = 3;
  }

  // v4 migration: WCM資産追加 + AB強気ラダー切替 + 再配分ルール追加
  if (version < 4) {
    console.log('Migrating state to v4 (WCM + AB aggressive ladder + allocation rules)...');
    try {
      // ── WCM 資産を追加（存在しない場合のみ・非破壊）──────────────────────
      const hasWcm = state.assets.some(a => a.id === 'asset-wcm');
      if (!hasWcm) {
        const wcm: Asset = {
          id: 'asset-wcm',
          name: 'WCM',
          type: 'fund',
          unitLabel: '口',
          currentPrice: 13298,
          averageCost: 13298,
          taxCostBasis: 13298,
          individualPrincipal: 13298,
          quantity: 376000,
          marketValue: 500208,
          unrealizedPnL: 0,
          realizedPnL: 0,
          notes: 'WCM 世界成長株厳選ファンド（予想分配金提示型）',
        };
        state.assets = [...state.assets, wcm];

        // priceState にも初期値を注入
        if (!state.priceState) state.priceState = {};
        if (!state.priceState['asset-wcm']) {
          state.priceState['asset-wcm'] = buildDefaultPriceState(wcm);
        }
      }

      // ── AB トリガーを強気ラダーに更新 ────────────────────────────────────
      // 旧 trig-ab-s1〜s5 を削除し、新しい 7ライン強気ラダーに差し替える。
      const nonAbRules = state.triggerRules.filter(r => r.assetId !== 'asset-ab');
      const aggressiveLadder = [
        { id: 'trig-ab-s1', assetId: 'asset-ab', direction: 'sell' as const, thresholdType: 'gte' as const, thresholdValue: 10890, quantityPlan: 500000,  label: '強気ラダー 10,890円 / 50万口',  isEnabled: true, isCompleted: false, cooldownUntil: null },
        { id: 'trig-ab-s2', assetId: 'asset-ab', direction: 'sell' as const, thresholdType: 'gte' as const, thresholdValue: 10920, quantityPlan: 500000,  label: '強気ラダー 10,920円 / 50万口',  isEnabled: true, isCompleted: false, cooldownUntil: null },
        { id: 'trig-ab-s3', assetId: 'asset-ab', direction: 'sell' as const, thresholdType: 'gte' as const, thresholdValue: 10950, quantityPlan: 750000,  label: '強気ラダー 10,950円 / 75万口',  isEnabled: true, isCompleted: false, cooldownUntil: null },
        { id: 'trig-ab-s4', assetId: 'asset-ab', direction: 'sell' as const, thresholdType: 'gte' as const, thresholdValue: 10980, quantityPlan: 750000,  label: '強気ラダー 10,980円 / 75万口',  isEnabled: true, isCompleted: false, cooldownUntil: null },
        { id: 'trig-ab-s5', assetId: 'asset-ab', direction: 'sell' as const, thresholdType: 'gte' as const, thresholdValue: 11020, quantityPlan: 1000000, label: '強気ラダー 11,020円 / 100万口', isEnabled: true, isCompleted: false, cooldownUntil: null },
        { id: 'trig-ab-s6', assetId: 'asset-ab', direction: 'sell' as const, thresholdType: 'gte' as const, thresholdValue: 11080, quantityPlan: 1000000, label: '強気ラダー 11,080円 / 100万口', isEnabled: true, isCompleted: false, cooldownUntil: null },
        { id: 'trig-ab-s7', assetId: 'asset-ab', direction: 'sell' as const, thresholdType: 'gte' as const, thresholdValue: 11150, quantityPlan: 950000,  label: '強気ラダー 11,150円 / 95万口',  isEnabled: true, isCompleted: false, cooldownUntil: null },
      ];
      state.triggerRules = [...nonAbRules, ...aggressiveLadder];

      // ── 再配分ルールを追加 ────────────────────────────────────────────────
      const defaultAllocationRules: AllocationRule[] = [
        {
          id: 'alloc-ab-sell',
          source: 'ab_sell',
          label: 'AB売却金 再配分',
          slices: [
            { assetId: 'asset-wcm',     label: 'WCM',      pct: 50 },
            { assetId: 'asset-invesco', label: 'インベスコ', pct: 50 },
          ],
          schedule: [
            { label: '受渡週', pct: 50 },
            { label: '翌週',   pct: 30 },
            { label: '翌々週', pct: 20 },
          ],
        },
        {
          id: 'alloc-stock-sell',
          source: 'stock_sell',
          label: '株式売却金 再配分',
          slices: [
            { assetId: 'cash',          label: '現金',      pct: 35 },
            { assetId: 'asset-wcm',     label: 'WCM',      pct: 39 },
            { assetId: 'asset-invesco', label: 'インベスコ', pct: 26 },
          ],
        },
        {
          id: 'alloc-annual',
          source: 'annual_investment',
          label: '年間追加投資',
          slices: [
            { assetId: 'asset-wcm',     label: 'WCM',      pct: 40 },
            { assetId: 'asset-invesco', label: 'インベスコ', pct: 60 },
          ],
          monthlyAmount: 125000,
        },
      ];

      if (!state.allocationRules || state.allocationRules.length === 0) {
        state.allocationRules = defaultAllocationRules;
      } else {
        // 既存ルールにないものだけ追加
        for (const rule of defaultAllocationRules) {
          if (!state.allocationRules.some(r => r.id === rule.id)) {
            state.allocationRules = [...state.allocationRules, rule];
          }
        }
      }

      state.version = 4;
    } catch (e) {
      console.error('Migration to v4 failed!', e);
    }
  }

  return state;
}
