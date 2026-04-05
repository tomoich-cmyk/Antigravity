import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AppState, TransactionType } from './types'
import { loadState, saveState, onStateChanged } from './lib/storage'
import { AssetCard } from './components/AssetCard'
import { QuickActions } from './components/QuickActions'
import { TransactionForm } from './components/TransactionForm'
import { PriceUpdatePanel } from './components/PriceUpdatePanel'
import { JudgmentLegend } from './components/JudgmentLegend'
import { Settings, RefreshCw, HelpCircle } from 'lucide-react'
import { toAssetCardViewModel } from './lib/assetMapper'
import { LABELS } from './constants/labels'

function App() {
  const [state, setState] = useState<AppState | null>(null)
  const [quickAction, setQuickAction] = useState<{ assetId: string, type: string, quantity: number } | null>(null);
  const [showPriceUpdate, setShowPriceUpdate] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const navigate = useNavigate();
  const openSettings = () => {
    const chromeObj = (window as any).chrome;
    if (chromeObj?.tabs?.create) {
        chromeObj.tabs.create({ url: chromeObj.runtime.getURL('index.html#/settings') });
    } else {
        navigate('/settings');
    }
  };

  useEffect(() => {
    loadState().then(setState)
    onStateChanged(setState)
  }, [])

  useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])

  const updateCash = async () => {
      if(!state) return;
      const amountInput = document.getElementById('cashInput') as HTMLInputElement;
      const dateInput = document.getElementById('cashDate') as HTMLInputElement;
      const noteInput = document.getElementById('cashNote') as HTMLInputElement;
      
      if(!amountInput || !dateInput) return;
      const amount = Number(amountInput.value);
      if(isNaN(amount)) return;
      
      // Update bucket
      const bucketIndex = state.cashBuckets.findIndex(b => b.id === 'cash-total');
      if(bucketIndex >= 0) {
          state.cashBuckets[bucketIndex].amount = amount;
          
          // Also record as a "cash" transaction for history (using a virtual asset id "cash")
          // This fulfills "反映先は4か所: 1. 取引履歴"
          const cashTx: any = {
            id: crypto.randomUUID(),
            assetId: 'cash',
            type: 'adjustment',
            date: dateInput.value,
            quantity: amount,
            price: 1,
            fee: 0,
            tax: 0,
            realizedPnL: 0,
            note: noteInput?.value || '現金残高更新',
            status: 'confirmed',
            createdAt: Date.now(),
            updatedAt: Date.now()
          };
          state.transactions.push(cashTx);
          
          await saveState({...state});
      }
      setQuickAction(null);
  }

  if (!state) return <div className="p-4 text-center">Loading...</div>

  const mainCash = state.cashBuckets.find(b => b.id === 'cash-total')?.amount || 0;
  const totalMarketValue = state.assets.reduce((sum, a) => sum + a.marketValue, 0)
  const totalAssets = totalMarketValue + mainCash
  const formatCurrency = (val: number) => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(val)

  // 1. 全銘柄の ViewModel を生成
  const viewModels = state.assets.map(asset => toAssetCardViewModel(asset, state));

  let sellCandidatesCount = 0;
  let buyCandidatesCount = 0;
  let stalePricesCount = 0;
  
  viewModels.forEach(vm => {
     if (vm.priceMeta.isStale) stalePricesCount++;
     
     if (vm.decisionKey === 'sell_priority' || vm.decisionKey === 'sell_approaching') {
         sellCandidatesCount++;
     }
     
     if (vm.decisionKey === 'front_run_candidate' || vm.decisionKey === 'normal_candidate') {
         buyCandidatesCount++;
     }
  });

  const plannedOrdersCount = state.transactions?.filter(t => t.status === 'planned').length || 0;
  const totalActionItems = sellCandidatesCount + buyCandidatesCount + stalePricesCount + plannedOrdersCount;

  return (
    <div className="min-h-screen bg-[var(--bg-sidebar)] transition-colors duration-300">
      <div className="w-full max-w-[480px] mx-auto min-h-screen flex flex-col bg-[var(--bg-card)] text-[var(--text-main)] font-sans shadow-2xl relative">
        {/* Header */}
        <div className="bg-[var(--bg-sidebar)] text-white p-2.5 flex justify-between items-center shrink-0 shadow-lg z-20 sticky top-0 border-b border-white/5">
          <div className="font-bold flex items-center gap-2">
            <img src="/logo.png" alt="Antigravity" className="w-5 h-5 object-contain" />
            <span className="tracking-tight">{LABELS.app.name}</span>
          </div>
          <div className="flex items-center gap-3">
              <button 
                  onClick={() => setShowPriceUpdate(!showPriceUpdate)} 
                  className={`flex items-center gap-1 text-xs transition-colors ${showPriceUpdate ? 'text-indigo-300' : 'hover:text-gray-300'}`}
              >
                  <RefreshCw size={14} /> {LABELS.sections.priceUpdate}
              </button>
              <button 
                  onClick={openSettings}
                  className="flex items-center gap-1 text-xs hover:text-gray-300 transition-colors"
              >
                  <Settings size={14} /> {LABELS.sections.settings}
              </button>
          </div>
        </div>

        {showPriceUpdate && (
            <div className="p-3 bg-[var(--bg-main)] border-b border-[var(--border-main)] z-10 shadow-inner animate-in slide-in-from-top-2">
                <PriceUpdatePanel assets={state.assets} />
            </div>
        )}

        <div className="p-3 bg-[var(--bg-card)] border-b border-[var(--border-main)] shrink-0 shadow-sm z-10 transition-colors duration-300">
          <div className="flex justify-between items-baseline mb-2">
            <div className="text-[10px] text-[var(--text-muted)] font-bold">{LABELS.summary.totalAssets}</div>
            <div className="text-2xl font-black tracking-tighter text-[var(--text-main)]">{formatCurrency(totalAssets)}</div>
          </div>
          <div className="flex justify-between items-baseline pt-2 border-t border-[var(--border-main)] mt-0.5">
            <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-tight italic opacity-70">{LABELS.summary.cashOnHand}</div>
            <div className="text-base font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(mainCash)}</div>
          </div>
        
        {totalActionItems > 0 && (
          <div className="mt-3 bg-[var(--bg-card)] border border-[var(--border-main)] rounded-xl shadow-xl overflow-hidden animate-in fade-in-0 duration-700">
             <div className="bg-indigo-600 dark:bg-indigo-500 text-white text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1.5 flex items-center justify-between shadow-lg">
                <div className="flex items-center gap-1.5">
                   <span>📋 アクティブ・アラート</span>
                   <button onClick={() => setIsHelpOpen(true)} className="hover:bg-white/20 p-0.5 rounded-full transition cursor-pointer">
                      <HelpCircle size={12} />
                   </button>
                </div>
                <span className="bg-white/20 px-2 py-0.25 rounded-full font-black">残 {totalActionItems} 件</span>
             </div>
             <div className="p-2 grid grid-cols-2 gap-2 text-[9px] font-bold">
                <div className={`flex justify-between p-2 rounded-lg transition ${sellCandidatesCount > 0 ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 shadow-sm' : 'text-[var(--text-muted)] opacity-50'}`}>
                   <span className="tracking-tighter">{LABELS.summary.sellCandidates}</span>
                   <span className="font-black text-xs">{sellCandidatesCount}</span>
                </div>
                <div className={`flex justify-between p-2 rounded-lg transition ${buyCandidatesCount > 0 ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shadow-sm' : 'text-[var(--text-muted)] opacity-50'}`}>
                   <span className="tracking-tighter">{LABELS.summary.buyCandidates}</span>
                   <span className="font-black text-xs">{buyCandidatesCount}</span>
                </div>
                <div className={`flex justify-between p-2 rounded-lg transition ${stalePricesCount > 0 ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shadow-sm' : 'text-[var(--text-muted)] opacity-50'}`}>
                   <span className="tracking-tighter">{LABELS.summary.stalePrices}</span>
                   <span className="font-black text-xs">{stalePricesCount}</span>
                </div>
                <div className={`flex justify-between p-2 rounded-lg transition ${plannedOrdersCount > 0 ? 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20 shadow-sm' : 'text-[var(--text-muted)] opacity-50'}`}>
                   <span className="tracking-tighter">{LABELS.summary.plannedOrders} あり</span>
                   <span className="font-black text-xs">{plannedOrdersCount}</span>
                </div>
             </div>
          </div>
        )}
      </div>

      {/* Asset List & Actions */}
      <div className="p-2 flex-1 pb-2">
        <div className="mb-2">
            <QuickActions onSelectAction={(assetId, type, quantity) => setQuickAction({ assetId, type, quantity })} />
        </div>

        <div className="grid grid-cols-2 gap-2 items-stretch">
            {viewModels.map(vm => (
            <AssetCard 
              key={vm.id} 
              vm={vm}
            />
            ))}
        </div>
      </div>

      {quickAction?.type === 'cash' && (
          <div className="fixed inset-0 z-50 bg-black/60 flex flex-col justify-end transition-opacity backdrop-blur-sm">
              <div className="bg-[var(--bg-card)] rounded-t-3xl border-t border-[var(--border-main)] overflow-hidden w-full p-8 animate-in slide-in-from-bottom-5 duration-300">
                  <h3 className="font-black text-xl text-[var(--text-main)] mb-2 flex items-center gap-3">💵 現金残高の更新</h3>
                  <p className="text-xs text-[var(--text-muted)] mb-6 font-medium leading-relaxed">口座の現金残高を手入力で更新します。</p>
                  
                  <div className="space-y-4">
                      <div>
                          <label className="block text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1.5 ml-1">日付</label>
                          <input 
                              type="date" 
                              id="cashDate"
                              className="w-full bg-[var(--bg-main)] border border-[var(--border-main)] rounded-2xl p-4 text-[var(--text-main)] font-bold focus:ring-4 focus:ring-indigo-600/20 focus:outline-none transition-all" 
                              defaultValue={new Date().toISOString().split('T')[0]}
                          />
                      </div>
                      <div>
                          <label className="block text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1.5 ml-1">現在の現金残高</label>
                          <input 
                              type="number" 
                              id="cashInput"
                              placeholder="0"
                              className="w-full bg-[var(--bg-main)] border border-[var(--border-main)] rounded-2xl p-4 text-right font-black text-2xl text-[var(--text-main)] focus:ring-4 focus:ring-indigo-600/20 focus:outline-none transition-all" 
                              defaultValue={state.cashBuckets.find(b => b.id === 'cash-total')?.amount}
                          />
                      </div>
                      <div>
                          <label className="block text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1.5 ml-1">メモ（任意）</label>
                          <input 
                              type="text" 
                              id="cashNote"
                              placeholder="給与振込、生活費引き出しなど"
                              className="w-full bg-[var(--bg-main)] border border-[var(--border-main)] rounded-2xl p-4 text-[var(--text-main)] font-bold focus:ring-4 focus:ring-indigo-600/20 focus:outline-none transition-all" 
                          />
                      </div>
                  </div>

                  <div className="flex flex-col gap-3 mt-8">
                      <button onClick={updateCash} className="w-full py-4 bg-indigo-600 text-white font-black text-sm uppercase tracking-widest rounded-2xl hover:bg-indigo-700 transition shadow-xl active:scale-95">更新を登録する</button>
                      <button onClick={() => setQuickAction(null)} className="w-full py-3 bg-[var(--bg-main)] text-[var(--text-muted)] font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition">キャンセル</button>
                  </div>
              </div>
          </div>
      )}

      {quickAction && quickAction.type !== 'cash' && (
          <div className="fixed inset-0 z-50 bg-black/60 flex flex-col justify-end backdrop-blur-sm">
              <div className="bg-[var(--bg-card)] rounded-t-3xl border-t border-[var(--border-main)] overflow-hidden w-full max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-5 duration-300">
                  <TransactionForm 
                      assets={state.assets} 
                      initialAssetId={quickAction.assetId} 
                      initialType={quickAction.type as TransactionType}
                      existingTransaction={quickAction.quantity > 0 ? {
                          id: '', assetId: quickAction.assetId, date: new Date().toISOString().split('T')[0], type: quickAction.type as TransactionType, quantity: quickAction.quantity, price: 0, fee: 0, tax: 0, realizedPnL: 0, note: '', status: 'confirmed'
                      } : undefined}
                      onClose={() => setQuickAction(null)} 
                  />
              </div>
          </div>
      )}

      <JudgmentLegend isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      </div>
    </div>
  )
}

export default App
