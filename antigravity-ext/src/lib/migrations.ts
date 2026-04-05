import type { AppState, Asset, AssetPriceState } from '../types';

export const CURRENT_SCHEMA_VERSION = 3;

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

  return state;
}
