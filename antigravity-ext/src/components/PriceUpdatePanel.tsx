import React, { useState, useEffect } from 'react';
import type { Asset, MarketContext } from '../types';
import { saveBatchPrices, saveOfficialFundPrice, saveReferenceFundPrice, saveApiPrice, saveMarketContextFromSnapshot, evaluateAndSaveTriggers } from '../lib/price';
import { getMarketContext, saveMarketContext, fetchRemoteMarketSnapshot } from '../lib/marketContext';
import { prepareSyncPreview } from '../lib/sync';
import { loadState } from '../lib/storage';
import type { SyncResult } from '../types/sync';
import { LABELS } from '../constants/labels';
import { MESSAGES } from '../constants/messages';

interface Props {
  assets: Asset[];
}

export const PriceUpdatePanel: React.FC<Props> = ({ assets }) => {
  const [tab, setTab] = useState<'stocks'|'funds'|'market'>('stocks');
  
  // States for forms
  const [stockPrices, setStockPrices] = useState<Record<string, string>>({});
  const [fundOfficial, setFundOfficial] = useState<Record<string, string>>({});
  const [fundReference, setFundReference] = useState<Record<string, string>>({});
  
  const [marketCtx, setMarketCtx] = useState<Partial<MarketContext>>({});
  const [syncPreview, setSyncPreview] = useState<SyncResult | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [toast, setToast] = useState('');
  const [baselineDates, setBaselineDates] = useState<Record<string, string>>({});

  const stocks = assets.filter(a => a.type === 'stock');
  const funds = assets.filter(a => a.type === 'fund');

  useEffect(() => {
    getMarketContext().then(ctx => {
      if (ctx) setMarketCtx(ctx);
    });
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleBatchStocks = async (mode: 'midday'|'close') => {
    setIsUpdating(true);
    const updates = Object.entries(stockPrices)
      .map(([assetId, price]) => ({ assetId, price: parseFloat(price) }))
      .filter(u => !isNaN(u.price) && u.price > 0);
      
    if (updates.length > 0) {
      const marketTime = mode === 'close' ? '15:00:00' : '11:30:00';
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const marketDataAt = `${dateStr}T${marketTime}`;

      await saveBatchPrices(updates, marketDataAt);
      setStockPrices({});
      showToast(MESSAGES.stockBatchSuccess(mode, updates.length));
    } else {
      showToast(MESSAGES.noInputError());
    }
    setIsUpdating(false);
  };

  const handleUpdateFund = async (assetId: string, type: 'official'|'reference') => {
    const val = parseFloat(type === 'official' ? fundOfficial[assetId] : fundReference[assetId]);
    if (isNaN(val) || val <= 0) return;
    setIsUpdating(true);
    
    if (type === 'official') {
       await saveOfficialFundPrice(assetId, val, baselineDates[assetId]);
       setFundOfficial(prev => ({...prev, [assetId]: ''}));
       showToast(MESSAGES.officialPriceSaveSuccess());
    } else {
       await saveReferenceFundPrice(assetId, val, baselineDates[assetId]);
       setFundReference(prev => ({...prev, [assetId]: ''}));
       showToast(MESSAGES.referencePriceApplySuccess());
    }
    setIsUpdating(false);
  };

  const handleSaveMarket = async () => {
    setIsUpdating(true);
    const safeCtx = { ...marketCtx };
    if (isNaN(safeCtx.usdJpyDeltaPct as number)) delete safeCtx.usdJpyDeltaPct;
    if (isNaN(safeCtx.usIndexDeltaPct as number)) delete safeCtx.usIndexDeltaPct;
    if (isNaN(safeCtx.worldIndexDeltaPct as number)) delete safeCtx.worldIndexDeltaPct;

    await saveMarketContext(safeCtx);
    showToast(MESSAGES.marketSaveSuccess());
    setIsUpdating(false);
  };

  const handleAutoFetchMarket = async () => {
    setIsUpdating(true);
    try {
      const snapshot = await fetchRemoteMarketSnapshot();
      if (!snapshot) {
        throw new Error('データの取得に失敗しました');
      }
      
      const state = await loadState();
      const result = prepareSyncPreview(snapshot, state);
      setSyncPreview(result);
      
      setMarketCtx(prev => ({ ...prev, ...result.stagedContext }));
      setStockPrices(prev => ({
        ...prev,
        ...Object.entries(result.stagedAssetPrices).reduce((acc, [id, price]) => {
          acc[id] = price.toString();
          return acc;
        }, {} as Record<string, string>)
      }));

      showToast(MESSAGES.syncFetchSuccess(result.updatedAssets.length, result.updatedContextKeys.length));
    } catch (err) {
      console.error(err);
      showToast(err instanceof Error ? err.message : '同期情報の取得に失敗しました');
      setSyncPreview(null);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleConfirmSync = async () => {
    if (!syncPreview) return;
    setIsUpdating(true);
    try {
      for (const [assetId, price] of Object.entries(syncPreview.stagedAssetPrices)) {
        const details = syncPreview.stagedAssetDetails?.[assetId];
        await saveApiPrice(
          assetId, 
          price, 
          Date.now(), 
          syncPreview.snapshotTimestamp,
          details?.priceKind as any,
          details?.marketDataAt,
          details?.baselineDate
        );
      }
      await saveMarketContextFromSnapshot(syncPreview.stagedContext, Date.now());
      await evaluateAndSaveTriggers();
      setSyncPreview(null);
      showToast(MESSAGES.syncComplete());
    } catch (err) {
      console.error(err);
      showToast(MESSAGES.saveError());
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="bg-[var(--bg-card)] rounded-2xl shadow-xl border border-[var(--border-main)] overflow-hidden transition-all duration-300">
      <div className="flex border-b border-[var(--border-main)] text-[11px] font-black uppercase tracking-widest bg-[var(--bg-main)]">
        <button className={`flex-1 py-3 transition-colors ${tab === 'stocks' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400 bg-[var(--bg-card)]' : 'text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/5'}`} onClick={() => setTab('stocks')}>{LABELS.sections.stockUpdate}</button>
        <button className={`flex-1 py-3 transition-colors ${tab === 'funds' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400 bg-[var(--bg-card)]' : 'text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/5'}`} onClick={() => setTab('funds')}>{LABELS.sections.fundUpdate}</button>
        <button className={`flex-1 py-3 transition-colors ${tab === 'market' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400 bg-[var(--bg-card)]' : 'text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/5'}`} onClick={() => setTab('market')}>{LABELS.sections.marketInput}</button>
      </div>

      <div className="p-4">
        {toast && (
          <div className="mb-4 p-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold text-center rounded-xl border border-emerald-500/20 animate-in slide-in-from-top-2">
            {toast}
          </div>
        )}

        {tab === 'stocks' && (
          <div className="space-y-3">
            <div className="flex gap-2 justify-end mb-1">
               <button onClick={() => handleBatchStocks('midday')} disabled={isUpdating} className="text-[9px] font-black px-2 py-1 bg-blue-600/10 text-blue-600 dark:text-blue-400 rounded-lg border border-blue-600/20 hover:bg-blue-600/20 transition uppercase tracking-tighter">{LABELS.actions.saveMidday}</button>
               <button onClick={() => handleBatchStocks('close')} disabled={isUpdating} className="text-[9px] font-black px-2 py-1 bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 rounded-lg border border-indigo-600/20 hover:bg-indigo-600/20 transition uppercase tracking-tighter">{LABELS.actions.saveClose}</button>
            </div>
            <div className="space-y-1.5">
              {stocks.map(asset => (
                <div key={asset.id} className="flex items-center justify-between text-xs p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                  <span className="font-bold text-[var(--text-main)] truncate mr-2">
                    {asset.name} 
                    <span className="text-[10px] font-medium text-[var(--text-muted)] ml-1 opacity-60 italic">({asset.currentPrice.toLocaleString()}円)</span>
                  </span>
                  <input 
                    type="number" step="any"
                    className="w-20 px-2 py-1 bg-[var(--bg-main)] border border-[var(--border-main)] rounded-lg focus:ring-2 focus:ring-indigo-600/50 focus:outline-none text-right font-mono font-bold"
                    placeholder="0" value={stockPrices[asset.id] !== undefined ? stockPrices[asset.id] : ''} onChange={e => setStockPrices(p => ({...p, [asset.id]: e.target.value}))}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'funds' && (
          <div className="space-y-2">
             {funds.map(asset => (
                <div key={asset.id} className="border border-[var(--border-main)] rounded-2xl p-3 bg-[var(--bg-main)]/50">
                  <div className="font-black text-xs text-[var(--text-main)] mb-2 uppercase tracking-tight">{asset.name}</div>
                  <div className="flex flex-col gap-2 text-[11px]">
                     <div className="flex items-center justify-between group bg-indigo-500/5 p-2 rounded-xl border border-indigo-500/10 mb-1">
                        <div className="flex flex-col">
                           <span className="text-[var(--text-muted)] font-bold uppercase text-[8px] tracking-widest">基準日</span>
                           <input type="date" className="bg-transparent border-none text-[10px] font-bold focus:outline-none p-0" value={baselineDates[asset.id] || new Date().toISOString().split('T')[0]} onChange={e => setBaselineDates(p => ({...p, [asset.id]: e.target.value}))} />
                        </div>
                     </div>
                     <div className="flex items-center justify-between group">
                        <span className="text-[var(--text-muted)] font-bold uppercase text-[9px] tracking-widest">{LABELS.asset.officialPrice} (確定)</span>
                        <div className="flex gap-2 items-center">
                           <input type="number" step="any" className="w-20 px-2 py-1 bg-[var(--bg-card)] border border-[var(--border-main)] rounded-lg focus:ring-2 focus:ring-indigo-600/50 focus:outline-none text-right font-mono font-bold" placeholder={asset.currentPrice.toLocaleString()} value={fundOfficial[asset.id] !== undefined ? fundOfficial[asset.id] : ''} onChange={e => setFundOfficial(p => ({...p, [asset.id]: e.target.value}))} />
                           <button onClick={() => handleUpdateFund(asset.id, 'official')} disabled={!fundOfficial[asset.id] || isUpdating} className="px-2 py-1 bg-indigo-500 text-white font-black rounded-lg disabled:opacity-30 hover:bg-indigo-400 transition text-[9px] uppercase tracking-widest shadow-lg shadow-indigo-500/20">{LABELS.actions.save}</button>
                        </div>
                     </div>
                     <div className="flex items-center justify-between group">
                        <span className="text-[var(--text-muted)] font-bold uppercase text-[9px] tracking-widest flex items-center gap-1">
                          {LABELS.asset.referencePrice} (試算) 
                        </span>
                        <div className="flex gap-2 items-center">
                           <input type="number" step="any" className="w-20 px-2 py-1 bg-[var(--bg-card)] border border-[var(--border-main)] rounded-lg focus:ring-2 focus:ring-amber-500/50 focus:outline-none text-right font-mono font-bold" value={fundReference[asset.id] !== undefined ? fundReference[asset.id] : ''} onChange={e => setFundReference(p => ({...p, [asset.id]: e.target.value}))} />
                           <button onClick={() => handleUpdateFund(asset.id, 'reference')} disabled={!fundReference[asset.id] || isUpdating} className="px-2 py-1 bg-amber-600 text-white font-black rounded-lg disabled:opacity-30 hover:bg-amber-500 transition text-[9px] uppercase tracking-widest shadow-lg shadow-amber-600/20">{LABELS.actions.apply}</button>
                        </div>
                     </div>
                  </div>
                </div>
             ))}
          </div>
        )}

        {tab === 'market' && (
          <div className="space-y-4 text-[13px] py-1">
             <div className="flex justify-between items-center mb-2">
                <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-tight">環境トレンド・騰落率の反映</p>
                <button 
                  onClick={handleAutoFetchMarket} disabled={isUpdating}
                  className="text-[10px] font-black px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition flex items-center gap-1 shadow-lg shadow-indigo-600/20 active:scale-95"
                >
                  <span>🔄</span> {LABELS.actions.autoSync}
                </button>
             </div>
             
             <div className="space-y-2 bg-[var(--bg-main)] p-3 rounded-2xl border border-[var(--border-main)]">
               <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[var(--text-main)] transition-colors group-hover:text-indigo-400">USD/JPY 変動率 (%)</span>
                  <input type="number" step="any" className="w-16 px-2 py-1 bg-[var(--bg-card)] border border-[var(--border-main)] rounded-xl text-right focus:ring-2 focus:ring-indigo-600/30 focus:outline-none font-mono font-black" value={marketCtx.usdJpyDeltaPct !== undefined ? marketCtx.usdJpyDeltaPct : ''} onChange={e => setMarketCtx(p => ({...p, usdJpyDeltaPct: parseFloat(e.target.value)}))} placeholder="0.00" />
               </div>
               <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[var(--text-main)]">米国株 騰落率 (%)</span>
                  <input type="number" step="any" className="w-16 px-2 py-1 bg-[var(--bg-card)] border border-[var(--border-main)] rounded-xl text-right focus:ring-2 focus:ring-indigo-600/30 focus:outline-none font-mono font-black" value={marketCtx.usIndexDeltaPct !== undefined ? marketCtx.usIndexDeltaPct : ''} onChange={e => setMarketCtx(p => ({...p, usIndexDeltaPct: parseFloat(e.target.value)}))} placeholder="0.00" />
               </div>
               <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[var(--text-main)]">世界株 騰落率 (%)</span>
                  <input type="number" step="any" className="w-16 px-2 py-1 bg-[var(--bg-card)] border border-[var(--border-main)] rounded-xl text-right focus:ring-2 focus:ring-indigo-600/30 focus:outline-none font-mono font-black" value={marketCtx.worldIndexDeltaPct !== undefined ? marketCtx.worldIndexDeltaPct : ''} onChange={e => setMarketCtx(p => ({...p, worldIndexDeltaPct: parseFloat(e.target.value)}))} placeholder="0.00" />
               </div>
             </div>

             {syncPreview && (
                <div className="bg-indigo-600/5 border border-indigo-600/20 rounded-2xl p-4 animate-in fade-in slide-in-from-bottom-2">
                   <div className="flex justify-between items-center mb-3">
                      <h4 className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">同期プレビュー (PREVIEW)</h4>
                      <span className="text-[9px] font-bold text-[var(--text-muted)]">{syncPreview.fetchedAt && new Date(syncPreview.fetchedAt).toLocaleTimeString()} 取得</span>
                   </div>
                   <div className="space-y-2 mb-4">
                      {syncPreview.updatedAssets.length > 0 && (
                         <div className="flex gap-1 flex-wrap">
                            {syncPreview.updatedAssets.map(name => (
                               <span key={name} className="px-2 py-0.5 bg-indigo-600 text-white text-[9px] font-black rounded-full transition-transform hover:scale-105 select-none">{name}</span>
                            ))}
                         </div>
                      )}
                      <div className="text-[10px] space-y-1 font-medium text-[var(--text-main)]">
                         {syncPreview.updatedContextKeys.length > 0 && <p className="opacity-80">✅ {LABELS.sections.marketInput}項目 {syncPreview.updatedContextKeys.length} 件を更新</p>}
                         {syncPreview.failedKeys.length > 0 && <p className="text-rose-500 font-bold">⚠️ 失敗: {syncPreview.failedKeys.join(', ')}</p>}
                      </div>
                   </div>
                   <div className="flex gap-2">
                      <button onClick={handleConfirmSync} disabled={isUpdating} className="flex-1 py-2 bg-indigo-600 text-white text-[10px] font-black rounded-lg hover:bg-indigo-700 transition shadow-lg shadow-indigo-600/20 active:scale-95 uppercase tracking-widest">{LABELS.actions.confirm}</button>
                      <button onClick={() => setSyncPreview(null)} disabled={isUpdating} className="px-4 py-2 bg-[var(--border-main)] text-[var(--text-muted)] text-[10px] font-black rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition uppercase tracking-widest">{LABELS.actions.discard}</button>
                   </div>
                </div>
             )}

             <div className="pt-2">
                {!syncPreview && (
                   <button onClick={handleSaveMarket} disabled={isUpdating} className="w-full py-3 bg-[var(--bg-sidebar)] text-white rounded-xl font-black text-xs shadow-xl uppercase tracking-[0.2em] hover:bg-slate-800 transition active:scale-[0.98] disabled:opacity-50">{LABELS.actions.manualPriceUpdate}</button>
                )}
             </div>
          </div>
        )}
      </div>
    </div>
  );
};
