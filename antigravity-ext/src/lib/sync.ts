import type { AppState } from '../types';
import type { MarketSnapshot } from '../types/snapshot';
import type { SyncResult } from '../types/sync';

/**
 * サーバーのスナップショットからプレビュー用データを生成する。
 * この関数は副作用を持たず、ストレージへの保存は行わない。
 */
export function prepareSyncPreview(
  snapshot: MarketSnapshot,
  state: AppState
): SyncResult {
  const result: SyncResult = {
    stagedAssetPrices: {},
    stagedContext: {},
    updatedAssets: [],
    updatedContextKeys: [],
    failedKeys: [],
    skippedKeys: [],
    staleKeys: [],
    warnings: [],
    fetchedAt: snapshot.fetchedAt,
    snapshotTimestamp: snapshot.fetchedAt, // サーバー側で別途あればそれを使う
  };

  const isValidNum = (v: any) => typeof v === 'number' && !isNaN(v);

  // 1. 市況データのマッピング (Forex/Index)
  const { usdJpy, usProxy, worldProxy } = snapshot.context;
  
  if (usdJpy) {
    if (isValidNum(usdJpy.price)) {
      result.stagedContext.usdJpy = usdJpy.price;
      result.updatedContextKeys.push('USD/JPY Price');
    }
    if (isValidNum(usdJpy.changePct)) {
      result.stagedContext.usdJpyDeltaPct = usdJpy.changePct;
      result.updatedContextKeys.push('USD/JPY Delta');
    }
  }

  if (usProxy && isValidNum(usProxy.changePct)) {
    result.stagedContext.usIndexDeltaPct = usProxy.changePct;
    result.updatedContextKeys.push('US Index Delta');
  }

  if (worldProxy && isValidNum(worldProxy.changePct)) {
    result.stagedContext.worldIndexDeltaPct = worldProxy.changePct;
    result.updatedContextKeys.push('World Index Delta');
  }

  // 2. 個別株のマッピング (Symbol-based)
  // サーバーの stocks キー (gmopg, unext 等) とその中身をループ
  for (const [key, quote] of Object.entries(snapshot.stocks)) {
    if (!quote) continue;

    // symbol マッピングを試みる (現在はサーバー側のキー名と symbol を突き合わせるか、
    // あるいは quote.source や内部マッピングテーブルを使用)
    
    // シンプルなシンボルマッピングテーブル (拡張可能)
    const symbolMap: Record<string, string> = {
      'gmopg': '3769',
      'unext': '9418',
      'ab': 'AB',
      'invesco': 'インベスコ'
    };
    
    const targetSymbol = symbolMap[key] || key;
    const targetAsset = state.assets.find(a => 
      a.symbol === targetSymbol || 
      a.id.includes(key) ||
      a.name.toLowerCase() === key.toLowerCase() ||
      a.name === symbolMap[key]
    );

    if (targetAsset) {
      if (isValidNum(quote.price)) {
        result.stagedAssetPrices[targetAsset.id] = quote.price;
        if (!result.stagedAssetDetails) result.stagedAssetDetails = {};
        result.stagedAssetDetails[targetAsset.id] = {
          priceKind: quote.priceKind,
          marketDataAt: quote.marketDataAt,
          baselineDate: quote.baselineDate
        };
        result.updatedAssets.push(targetAsset.name);
      } else {
        result.failedKeys.push(`${targetAsset.name}: 無効な価格データ`);
      }
    } else {
      result.skippedKeys.push(`未登録の銘柄: ${key}`);
    }
  }

  // 3. メタデータからの警告抽出
  if (snapshot._meta?.partial) {
    result.warnings.push('スナップショットの一部データが不完全です');
  }
  if (snapshot._meta?.stale) {
    result.staleKeys.push('サーバーのキャッシュが古い可能性があります');
  }
  if (snapshot._meta?.errors) {
    for (const [k, msg] of Object.entries(snapshot._meta.errors)) {
      result.failedKeys.push(`${k}: ${msg}`);
    }
  }

  return result;
}
