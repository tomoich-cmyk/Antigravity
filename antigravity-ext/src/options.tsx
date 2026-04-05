import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './index.css'
import type { AppState, TriggerRule, ThresholdType, DirectionType } from './types'
import { loadState, saveState, onStateChanged } from './lib/storage'
import { Settings, BarChart3, Clock, Wallet, Mail, ArrowLeft, Plus, X, Server, Moon, Sun } from 'lucide-react'
import { TransactionList } from './components/TransactionList'
import { TransactionForm } from './components/TransactionForm'
import { getSnapshotUrl, setSnapshotUrl } from './lib/snapshotFetcher'
import { LABELS } from './constants/labels'
import { calculateMarketScore } from './lib/marketScore'

// 推奨値を返すヘルパー
const getRecommendedMaxBuffer = (assetName: string): number => {
  if (assetName.includes('AB') || assetName.includes('インベスコ')) return 0.01; // 1.0%
  if (assetName.includes('GMO') || assetName.includes('U-NEXT')) return 0.005; // 0.5%
  return 0.01;
};

// 今年の確定取引から損益集計するヘルパー
function calcPnLSummary(state: AppState) {
  const thisYear = new Date().getFullYear().toString();
  const confirmedTx = (state.transactions || []).filter(
    t => !t.isDeleted && t.status === 'confirmed' && t.date.startsWith(thisYear)
  );

  let totalGain = 0;
  let totalLoss = 0;

  const byAsset: Record<string, { gain: number; loss: number; distribution: number }> = {};

  for (const tx of confirmedTx) {
    const asset = state.assets.find(a => a.id === tx.assetId);
    if (!asset) continue;
    const multiplier = asset.type === 'fund' ? 10000 : 1;
    const entry = byAsset[tx.assetId] ?? { gain: 0, loss: 0, distribution: 0 };

    if (tx.type === 'sell') {
      const pnl = tx.realizedPnL;
      if (pnl >= 0) { totalGain += pnl; entry.gain += pnl; }
      else { totalLoss += pnl; entry.loss += pnl; }
    } else if (tx.type === 'distribution') {
      const ordinary = tx.distributionBreakdown?.ordinary ??
        ((tx.price * (tx.quantity / multiplier)) - (tx.fee || 0) - (tx.tax || 0));
      totalGain += ordinary;
      entry.distribution += ordinary;
    }
    byAsset[tx.assetId] = entry;
  }

  // 含み損のある資産（損出し余地）
  const latentLosses = state.assets
    .filter(a => a.unrealizedPnL < 0)
    .map(a => ({ name: a.name, unrealizedPnL: a.unrealizedPnL }))
    .sort((a, b) => a.unrealizedPnL - b.unrealizedPnL);

  return { totalGain, totalLoss, byAsset, latentLosses };
}

function OptionsPage() {
  const [state, setState] = useState<AppState | null>(null)
  const [activeTab, setActiveTab] = useState('assets')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [triggerModal, setTriggerModal] = useState<{ assetId: string } | null>(null)
  const [snapshotUrl, setSnapshotUrlState] = useState(() => getSnapshotUrl())
  const [snapshotUrlSaved, setSnapshotUrlSaved] = useState<'none' | 'success' | 'error'>('none')
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'dark' || saved === 'light') return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'none' }>({ message: '', type: 'none' })

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast({ message: '', type: 'none' });
    }, 4000);
  };

  const navigate = useNavigate()

  // トリガー追加フォームの状態
  const [newTrigger, setNewTrigger] = useState<{
    direction: DirectionType;
    thresholdType: ThresholdType;
    thresholdValue: string;
    quantityPlan: string;
    label: string;
  }>({
    direction: 'buy',
    thresholdType: 'lte',
    thresholdValue: '',
    quantityPlan: '',
    label: ''
  })

  // GMOPG の買い条件の向きを「以下」にするための自動スイッチ
  useEffect(() => {
    if (newTrigger.direction === 'buy') {
      setNewTrigger(prev => ({ ...prev, thresholdType: 'lte' }));
    } else if (newTrigger.direction === 'sell') {
      setNewTrigger(prev => ({ ...prev, thresholdType: 'gte' }));
    }
  }, [newTrigger.direction]);

  useEffect(() => {
    loadState().then(setState)
    onStateChanged(setState)
  }, [])

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light')

  const openTriggerModal = (assetId: string) => {
    setNewTrigger({ direction: 'buy', thresholdType: 'lte', thresholdValue: '', quantityPlan: '', label: '' });
    setTriggerModal({ assetId });
  };

  const handleAddTrigger = async () => {
    if (!state || !triggerModal) return;
    const val = parseFloat(newTrigger.thresholdValue);
    const qty = parseFloat(newTrigger.quantityPlan);
    if (isNaN(val) || val <= 0 || isNaN(qty) || qty <= 0) {
      alert(LABELS.messages.inputErrorPositive);
      return;
    }
    const rule: TriggerRule = {
      id: crypto.randomUUID(),
      assetId: triggerModal.assetId,
      direction: newTrigger.direction,
      thresholdType: newTrigger.thresholdType,
      thresholdValue: val,
      quantityPlan: qty,
      label: newTrigger.label || `${val.toLocaleString()}円${newTrigger.thresholdType === 'gte' ? LABELS.trigger.gte : LABELS.trigger.lte}`,
      isEnabled: true,
      isCompleted: false,
      cooldownUntil: null
    };
    const newState = { ...state, triggerRules: [...state.triggerRules, rule] };
    setState(newState);
    await saveState(newState);
    setTriggerModal(null);
  };

  const toggleRule = async (ruleId: string) => {
    if (!state) return;
    const newRules = state.triggerRules.map(r => 
      r.id === ruleId ? { ...r, isEnabled: !r.isEnabled } : r
    );
    const newState = { ...state, triggerRules: newRules };
    setState(newState);
    await saveState(newState);
  };

  const handleExport = () => {
    if (!state) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "antigravity_backup_" + new Date().toISOString().split('T')[0] + ".json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    showToast("データを書き出しました");
  };

   const handleImport = () => {
    if (!window.confirm("現在のデータはすべて上書きされます。\n事前にバックアップを取ってから続行することを推奨します。\n\nよろしいですか？")) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = e => {
        const target = e.target as HTMLInputElement;
        const file = target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.readAsText(file, "UTF-8");
        reader.onload = async readerEvent => {
            try {
                const content = readerEvent.target?.result;
                if (typeof content === 'string') {
                    const parsed = JSON.parse(content) as AppState;
                    if (parsed.assets && parsed.triggerRules && parsed.transactions) {
                        setState(parsed);
                        await saveState(parsed);
                        showToast("データを読み込みました");
                    } else {
                        alert(LABELS.messages.importErrorFormat);
                    }
                }
            } catch (err) {
                alert(LABELS.messages.importErrorRead);
                console.error(err);
            }
        }
    }
    input.click();
  };

  if (!state) return <div className="p-8 text-center text-gray-500">Loading...</div>

  return (
    <div className="min-h-screen bg-[var(--bg-main)] flex flex-col md:flex-row font-sans transition-colors duration-300">
      {/* Sidebar */}
      <div className="w-full md:w-64 bg-[var(--bg-sidebar)] text-white flex flex-col shrink-0 shadow-2xl z-20 overflow-hidden">
        <div className="p-6">
          <button 
            onClick={() => navigate('/')} 
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-white mb-6 transition"
          >
            <ArrowLeft size={16} /> {LABELS.app.name}
          </button>
          <h1 className="text-xl font-bold flex items-center gap-2">🚀 {LABELS.app.name}</h1>
          
          <button 
            onClick={toggleTheme}
            className="mt-6 w-full flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition border border-white/10 group"
          >
            <span className="text-xs text-gray-400 font-medium">{theme === 'light' ? 'ライトモード' : 'ダークモード'}</span>
            <div className="text-indigo-400 group-hover:scale-110 transition-transform">
              {theme === 'light' ? <Sun size={18} /> : <Moon size={18} />}
            </div>
          </button>
        </div>
        
        <nav className="flex-1 px-4 space-y-1 text-sm mt-2 flex flex-row md:flex-col overflow-x-auto md:overflow-x-visible pb-4 md:pb-0 no-scrollbar">
          <button 
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition ${activeTab === 'assets' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
            onClick={() => setActiveTab('assets')}
          >
            <Wallet size={18} /> {LABELS.sections.assets}
          </button>
          
          <button 
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition ${activeTab === 'journal' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
            onClick={() => setActiveTab('journal')}
          >
            <Clock size={18} /> {LABELS.sections.journal}
          </button>

          <button 
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition ${activeTab === 'pnl' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
            onClick={() => setActiveTab('pnl')}
          >
            <BarChart3 size={18} /> {LABELS.sections.pnl}
          </button>

          <button 
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition ${activeTab === 'summary' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
            onClick={() => setActiveTab('summary')}
          >
            <Mail size={18} /> {LABELS.sections.summaryNotifications}
          </button>

          <button 
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition ${activeTab === 'settings' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={18} /> {LABELS.sections.settings}
          </button>
        </nav>
      </div>

      <div className="flex-1 p-4 md:p-8 overflow-y-auto min-w-0">
        <div className="w-full px-4">
          {activeTab === 'assets' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="mb-6 pb-4 border-b border-[var(--border-main)]">
                <h2 className="text-2xl font-black text-[var(--text-main)] tracking-tight">{LABELS.sections.assets}</h2>
                <p className="text-[var(--text-muted)] text-sm mt-1">保有資産と売買ルールを設定します</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                {state.assets.map(asset => {
                  const assetTriggers = state.triggerRules.filter(r => r.assetId === asset.id);
                  const activeTriggers = assetTriggers.filter(r => r.isEnabled && !r.isCompleted);
                  const buyRules = activeTriggers.filter(r => r.direction === 'buy').sort((a,b) => b.thresholdValue - a.thresholdValue);
                  const sellRules = activeTriggers.filter(r => r.direction === 'sell').sort((a,b) => a.thresholdValue - b.thresholdValue);
                  const primaryRuleForPreview = asset.quantity > 0 && sellRules.length > 0 ? sellRules[0] : 
                                               buyRules.length > 0 ? buyRules[0] : null;

                  return (
                    <div key={asset.id} className="bg-[var(--bg-card)] rounded-3xl shadow-sm border border-[var(--border-main)] p-8 hover:shadow-xl transition-all duration-500 group">
                      <div className="flex justify-between items-start mb-8 pb-6 border-b border-[var(--border-main)]">
                        <div>
                          <h3 className="text-xl font-black text-[var(--text-main)] flex items-center gap-3 tracking-tight">
                             {asset.name} 
                           <span className="text-[10px] px-2 py-0.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 rounded uppercase tracking-widest font-bold">
                             {asset.type === 'fund' ? 'MF' : 'EQ'}
                           </span>
                        </h3>
                        <div className="text-sm text-[var(--text-muted)] mt-4 flex gap-8 font-medium">
                          <div className="flex flex-col"><span className="text-[10px] text-[var(--text-muted)] uppercase font-black tracking-widest mb-1 opacity-60">{LABELS.asset.currentPrice}</span> <span className="text-[var(--text-main)] font-black">{asset.currentPrice.toLocaleString()}円</span></div>
                          <div className="flex flex-col"><span className="text-[10px] text-[var(--text-muted)] uppercase font-black tracking-widest mb-1 opacity-60">{LABELS.asset.averageCost}</span> <span className="text-[var(--text-main)] font-black">{asset.averageCost.toLocaleString()}円</span></div>
                          <div className="flex flex-col"><span className="text-[10px] text-[var(--text-muted)] uppercase font-black tracking-widest mb-1 opacity-60">{LABELS.asset.holdingQty}</span> <span className="text-[var(--text-main)] font-mono font-black">{asset.quantity.toLocaleString()}{asset.unitLabel}</span></div>
                        </div>
                      </div>
                      <div className="text-right">
                         <div className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-1.5 opacity-60">{LABELS.asset.updateTime}</div>
                         <div className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 bg-indigo-500/5 px-3 py-1.5 rounded-full border border-indigo-500/10">
                           {asset.lastPriceUpdatedAt ? new Date(asset.lastPriceUpdatedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '待機中'}
                         </div>
                      </div>
                    </div>
                    
                    {/* 可変判断帯 (Watch Zone) Settings */}
                    <div className="bg-slate-50 dark:bg-white/2 rounded-2xl p-6 mb-8 border border-[var(--border-main)]">
                      <h4 className="text-[11px] font-black text-[var(--text-main)] uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                        <Settings size={14} className="text-indigo-500" /> {LABELS.asset.decisionBand}
                      </h4>
                      <div className="space-y-6">
                        <div className="flex flex-col md:flex-row md:items-center gap-6">
                          <label className="flex items-center gap-3 cursor-pointer group">
                             <div className="relative">
                               <input 
                                 type="checkbox" 
                                 checked={!!asset.watchZoneEnabled}
                                 onChange={async (e) => {
                                   const isEnabling = e.target.checked;
                                   const newAssets = state.assets.map(a => {
                                     if(a.id === asset.id) {
                                       return { 
                                         ...a, 
                                         watchZoneEnabled: isEnabling,
                                         maxBufferPct: a.maxBufferPct || getRecommendedMaxBuffer(a.name)
                                       };
                                     }
                                     return a;
                                   });
                                   const newState = { ...state, assets: newAssets };
                                   setState(newState); await saveState(newState);
                                 }}
                                 className="peer sr-only"
                               />
                               <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                             </div>
                             <span className="text-xs font-black text-[var(--text-main)] transition-colors">可変判断帯を使う</span>
                          </label>

                          <label className={`flex items-center gap-3 cursor-pointer transition-all ${!asset.watchZoneEnabled ? 'opacity-10 grayscale cursor-not-allowed pointer-events-none' : ''}`}>
                             <div className="relative">
                               <input 
                                 type="checkbox" 
                                 disabled={!asset.watchZoneEnabled}
                                 checked={!!asset.marketScoreEnabled}
                                 onChange={async (e) => {
                                   const newAssets = state.assets.map(a => a.id === asset.id ? { ...a, marketScoreEnabled: e.target.checked } : a);
                                   const newState = { ...state, assets: newAssets };
                                   setState(newState); await saveState(newState);
                                 }}
                                 className="peer sr-only"
                               />
                               <div className={`w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 ${!asset.watchZoneEnabled ? 'after:bg-white/40' : 'after:bg-white'}`}></div>
                             </div>
                             <span className={`text-xs font-black transition-colors ${!asset.watchZoneEnabled ? 'text-[var(--text-muted)]' : 'text-[var(--text-main)]'}`}>市況補正を反映する</span>
                          </label>
                        </div>

                        <div className={`pt-6 border-t border-[var(--border-main)]/50 transition-all ${!asset.watchZoneEnabled ? 'opacity-10 grayscale pointer-events-none' : ''}`}>
                           <div className="flex flex-col md:flex-row md:items-start gap-4">
                              <div className="flex-1 w-full">
                                 <div className="flex justify-between items-baseline mb-2.5">
                                    <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">最大変動幅</label>
                                    <span className="text-xs font-black text-indigo-500">{(asset.maxBufferPct || 0.01) * 100}%</span>
                                 </div>
                                 <input 
                                   type="range"
                                   min="0"
                                   max="3.0"
                                   step="0.1"
                                   value={(asset.maxBufferPct || 0.01) * 100}
                                   disabled={!asset.watchZoneEnabled}
                                   onChange={async (e) => {
                                     const val = Math.max(0, Math.min(3.0, parseFloat(e.target.value))) / 100;
                                     const newAssets = state.assets.map(a => a.id === asset.id ? { ...a, maxBufferPct: val } : a);
                                     const newState = { ...state, assets: newAssets };
                                     setState(newState); await saveState(newState);
                                   }}
                                   className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                 />
                              </div>

                              <div className="w-full md:w-auto grid grid-cols-2 gap-3">
                                <div className="bg-[var(--bg-main)]/50 p-3 rounded-xl border border-[var(--border-main)] min-w-[100px]">
                                   <div className="text-[9px] font-black text-[var(--text-muted)] uppercase mb-1 opacity-60">基準価格</div>
                                   <div className="text-xs font-black text-[var(--text-main)] font-mono">
                                      {(primaryRuleForPreview ? primaryRuleForPreview.thresholdValue : asset.averageCost).toLocaleString()}円
                                   </div>
                                </div>
                                <div className="bg-[var(--bg-main)]/50 p-3 rounded-xl border border-[var(--border-main)] min-w-[140px]">
                                   <div className="text-[9px] font-black text-[var(--text-muted)] uppercase mb-1 opacity-60">判断帯範囲</div>
                                   <div className="text-[11px] font-black text-indigo-500 font-mono">
                                      {(() => {
                                         const base = primaryRuleForPreview ? primaryRuleForPreview.thresholdValue : asset.averageCost;
                                         const buffer = (asset.maxBufferPct || 0.01) * base;
                                         return `${(base - buffer).toLocaleString()} 〜 ${(base + buffer).toLocaleString()}円`;
                                      })()}
                                   </div>
                                </div>
                              </div>
                           </div>
                           <div className="mt-4 flex flex-col gap-1 text-[10px] text-[var(--text-muted)] font-bold">
                              <span>・基準価格に対する判断帯の最大変動幅</span>
                              <span>・市況スコアに応じて 0〜指定値% の範囲で自動調整</span>
                           </div>
                        </div>

                        {!asset.watchZoneEnabled && (
                           <p className="text-[10px] text-amber-500 font-black italic">
                             ※ 可変判断帯が無効のため編集できません
                           </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h4 className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em] opacity-60">売買ルール (トリガー)</h4>
                      </div>
                      <div className="overflow-hidden rounded-2xl border border-[var(--border-main)] shadow-sm bg-[var(--bg-main)]/10">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-[var(--bg-main)] text-[var(--text-muted)] border-b border-[var(--border-main)]">
                            <tr>
                              <th className="px-5 py-4 font-black text-[10px] uppercase tracking-wider">区分</th>
                              <th className="px-5 py-4 font-black text-[10px] uppercase tracking-wider">条件</th>
                              <th className="px-5 py-4 font-black text-[10px] uppercase tracking-wider">数量</th>
                              <th className="px-5 py-4 font-black text-[10px] uppercase tracking-wider text-center">状況</th>
                              <th className="px-5 py-4 font-black text-[10px] uppercase tracking-wider text-right">有効</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border-main)]">
                            {assetTriggers.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="px-5 py-10 text-center text-[var(--text-muted)] font-bold opacity-40">トリガーが設定されていません</td>
                              </tr>
                            ) : (
                              assetTriggers.map(r => {
                                let statusBadge = <span className="text-slate-400 opacity-60 font-medium">{LABELS.trigger.waiting}</span>;
                                if (!r.isEnabled) {
                                  statusBadge = <span className="text-gray-500 font-bold">{LABELS.trigger.stopped}</span>;
                                } else if (r.isCompleted) {
                                  statusBadge = <span className="text-purple-500 font-black">✨{LABELS.trigger.completed}</span>;
                                } else {
                                  const ps = state.priceState?.[asset.id];
                                  let evalPrice = asset.currentPrice;
                                  if (asset.type === 'fund' && state.useReferencePriceForTrigger && ps?.referencePrice) {
                                      evalPrice = ps.referencePrice;
                                  } else if (ps?.displayPrice) {
                                      evalPrice = ps.displayPrice;
                                  }
                                  
                                  const diff = evalPrice - r.thresholdValue;
                                  const isTriggered = r.thresholdType === 'gte' ? diff >= 0 : diff <= 0;
                                  
                                  if (isTriggered) {
                                      let isPending = false;
                                      if (asset.marketScoreEnabled && state.marketContext) {
                                         const marketResult = calculateMarketScore(asset, state.marketContext);
                                         if ((r.direction === 'buy' && marketResult.score < 0) || (r.direction === 'sell' && marketResult.score > 0)) {
                                            isPending = true;
                                         }
                                      }
                                      
                                      if (isPending) {
                                         statusBadge = <span className="text-amber-500 font-black">⏸️{LABELS.trigger.pending}</span>;
                                      } else {
                                         statusBadge = <span className="text-emerald-500 font-black">🎯{LABELS.trigger.reached}</span>;
                                      }
                                  } else {
                                      // Approaching calculation
                                      const base = r.thresholdValue;
                                      const buffer = (asset.maxBufferPct || 0.01) * base;
                                      const rangeMin = base - buffer;
                                      const rangeMax = base + buffer;
                                      if (evalPrice >= rangeMin && evalPrice <= rangeMax) {
                                         statusBadge = <span className="text-blue-500 font-black">📍{LABELS.trigger.approaching}</span>;
                                      }
                                  }
                                }
                                
                                return (
                                  <tr key={r.id} className={`transition-colors shadow-inner ${!r.isEnabled ? 'bg-gray-500/5 opacity-50 grayscale' : 'hover:bg-white/5'}`}>
                                    <td className="px-5 py-4 align-middle">
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${r.direction === 'buy' ? 'bg-blue-500/10 text-blue-600' : 'bg-rose-500/10 text-rose-600'}`}>
                                        {r.direction === 'buy' ? LABELS.trigger.buy : LABELS.trigger.sell}
                                      </span>
                                    </td>
                                    <td className="px-5 py-4 font-black text-[var(--text-main)] font-mono whitespace-nowrap">
                                      {r.thresholdValue.toLocaleString()}円{r.thresholdType === 'gte' ? LABELS.trigger.gte : LABELS.trigger.lte}
                                    </td>
                                    <td className="px-5 py-4 text-[var(--text-muted)] font-bold">{r.quantityPlan.toLocaleString()}{asset.unitLabel}</td>
                                    <td className="px-5 py-4 text-center">{statusBadge}</td>
                                    <td className="px-5 py-4">
                                      <div className="flex justify-end pr-1">
                                        <div 
                                          onClick={() => toggleRule(r.id)}
                                          className={`w-9 h-5 rounded-full flex items-center p-0.5 cursor-pointer transition-all ${r.isEnabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                                        >
                                          <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${r.isEnabled ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                      <button 
                        onClick={() => openTriggerModal(asset.id)}
                        className="w-full px-5 py-3.5 bg-indigo-600/5 text-indigo-600 dark:text-indigo-400 font-black rounded-2xl hover:bg-indigo-600/10 transition uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 border border-indigo-500/10"
                      >
                        <Plus size={14} /> {LABELS.actions.addTrigger}
                      </button>
                    </div>
                  </div>
                  )
                })}
              </div>
            </div>
          )}

          {activeTab === 'journal' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex justify-between items-end mb-8 border-b border-[var(--border-main)] pb-6">
                <div>
                  <h2 className="text-3xl font-black text-[var(--text-main)] tracking-tight">{LABELS.sections.journal}</h2>
                  <p className="text-[var(--text-muted)] text-sm mt-1">Portfolio Lifecycle Log</p>
                </div>
                <button 
                  onClick={() => setIsFormOpen(true)}
                  className="px-6 py-3 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition shadow-xl hover:-translate-y-0.5"
                >
                  + {LABELS.actions.inputTransaction}
                </button>
              </div>
              {state.transactions && state.transactions.length > 0 ? (
                <TransactionList assets={state.assets} transactions={state.transactions} />
              ) : (
                <div className="text-center py-32 bg-[var(--bg-card)] rounded-3xl border-2 border-dashed border-[var(--border-main)] relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                  <div className="relative z-10">
                    <Clock size={48} className="mx-auto text-gray-300 dark:text-gray-700 mb-6 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-500" />
                    <h3 className="text-xl font-black text-[var(--text-main)] mb-2 uppercase tracking-tight">まだ取引履歴はありません</h3>
                    <p className="text-[var(--text-muted)] text-sm font-bold opacity-60">最初の取引を登録すると、ここに履歴が並びます</p>
                    <button 
                      onClick={() => setIsFormOpen(true)}
                      className="mt-10 px-8 py-3 bg-indigo-600/10 text-indigo-600 font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-indigo-600 hover:text-white transition-all border border-indigo-500/20"
                    >
                      最初の取引を登録する
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {activeTab === 'pnl' && (() => {
            const { totalGain, totalLoss, byAsset, latentLosses } = calcPnLSummary(state);
            const netPnL = totalGain + totalLoss;
            const fmt = (v: number) => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(v);
            const thisYear = new Date().getFullYear();
            return (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="mb-10">
                  <h2 className="text-3xl font-black text-[var(--text-main)] tracking-tight">{LABELS.sections.pnl}</h2>
                  <p className="text-[var(--text-muted)] text-sm mt-1">Portfolio Performance Matrix ({thisYear})</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                  <div className="bg-[var(--bg-card)] rounded-2xl shadow-sm border border-[var(--border-main)] p-8 hover:shadow-xl transition-all duration-500 relative overflow-hidden group">
                    <div className="absolute -top-4 -right-4 opacity-5 group-hover:scale-110 transition-transform"><BarChart3 size={120} /></div>
                    <h3 className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2">実現総利益 (Gross Gain)</h3>
                    <div className="text-4xl font-black text-emerald-600 tracking-tighter">{fmt(totalGain)}</div>
                    <p className="text-[10px] text-[var(--text-muted)] mt-4 font-bold italic opacity-60">Includes dividends & capital gains</p>
                  </div>
                  
                  <div className="bg-[var(--bg-card)] rounded-2xl shadow-sm border border-[var(--border-main)] p-8 hover:shadow-xl transition-all duration-500 relative overflow-hidden group">
                    <div className="absolute -top-4 -right-4 opacity-5 group-hover:scale-110 transition-transform"><X size={120} /></div>
                    <h3 className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2">実現総損失 (Gross Loss)</h3>
                    <div className="text-4xl font-black text-rose-500 tracking-tighter">{fmt(totalLoss)}</div>
                    <p className="text-[10px] text-[var(--text-muted)] mt-4 font-bold italic opacity-60">Capital losses realized from sales</p>
                  </div>
                  
                  <div className="col-span-1 md:col-span-2 bg-slate-900 text-white rounded-3xl p-10 shadow-2xl relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/30 via-transparent to-transparent"></div>
                    <h3 className="text-[11px] font-black text-indigo-400 uppercase tracking-[0.3em] mb-4 relative z-10">Yearly Net Performance</h3>
                    <div className={`text-6xl font-black tracking-tighter relative z-10 ${netPnL >= 0 ? 'text-white' : 'text-rose-400'}`}>
                      {netPnL > 0 ? '+' : ''}{fmt(netPnL)}
                    </div>
                    {netPnL > 0 && (
                      <p className="text-xs font-semibold text-slate-400 mt-8 max-w-lg leading-relaxed relative z-10 border-l border-indigo-500/30 pl-4">
                        💡 課税対象額に対する源泉所得税の見込み額は約 <span className="text-white font-black">{fmt(netPnL * 0.20315)}</span> です。
                        複数の証券口座をご利用の場合、確定申告による損益通算が有効な場合があります。
                      </p>
                    )}
                  </div>
                </div>

                {Object.keys(byAsset).length > 0 && (
                  <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-[var(--border-main)] p-8 mb-8">
                    <h3 className="text-lg font-black text-[var(--text-main)] mb-6 uppercase tracking-tight">資産別内訳</h3>
                    <table className="w-full text-sm">
                      <thead className="text-[10px] text-[var(--text-muted)] font-black uppercase tracking-widest border-b border-[var(--border-main)]">
                        <tr>
                          <th className="text-left pb-4">資産名</th>
                          <th className="text-right pb-4">実現益</th>
                          <th className="text-right pb-4">実現損</th>
                          <th className="text-right pb-4">分配金</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-main)]">
                        {Object.entries(byAsset).map(([assetId, pnl]) => {
                          const asset = state.assets.find(a => a.id === assetId);
                          return (
                            <tr key={assetId} className="hover:bg-white/5 transition-colors">
                              <td className="py-4 font-black text-[var(--text-main)]">{asset?.name ?? assetId}</td>
                              <td className="py-4 text-right text-emerald-600 font-bold">{pnl.gain > 0 ? fmt(pnl.gain) : '—'}</td>
                              <td className="py-4 text-right text-rose-500 font-bold">{pnl.loss < 0 ? fmt(pnl.loss) : '—'}</td>
                              <td className="py-4 text-right text-indigo-500 font-bold">{pnl.distribution > 0 ? fmt(pnl.distribution) : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {latentLosses.length > 0 && (
                  <div className="bg-amber-500/5 rounded-3xl border border-amber-500/20 p-8 mb-10">
                    <h3 className="text-lg font-black text-amber-600 mb-2">🔎 損出し候補</h3>
                    <p className="text-xs text-amber-600/80 mb-6 font-bold">以下の含み損資産は、売却時に今年の利益との相殺候補になります。</p>
                    <div className="space-y-3">
                      {latentLosses.map(a => (
                        <div key={a.name} className="flex justify-between items-center text-sm">
                          <span className="text-amber-700 dark:text-amber-500 font-black">{a.name}</span>
                          <span className="text-rose-500 font-black font-mono">{fmt(a.unrealizedPnL)}</span>
                        </div>
                      ))}
                    </div>
                    {totalGain > 0 && (
                      <div className="mt-6 pt-6 border-t border-amber-500/20 text-xs text-amber-600 font-bold italic opacity-80">
                        💡 最大で {fmt(Math.min(totalGain, latentLosses.reduce((s, a) => s + Math.abs(a.unrealizedPnL), 0)))} を相殺できる可能性があります。
                      </div>
                    )}
                  </div>
                )}

                {Object.keys(byAsset).length === 0 && (
                  <div className="text-center py-24 bg-[var(--bg-card)] rounded-3xl border-2 border-dashed border-[var(--border-main)] font-black uppercase tracking-widest">
                    <div className="text-[var(--text-muted)] opacity-40">確定済み取引がまだありません</div>
                    <div className="text-[10px] text-indigo-500 mt-2 opacity-60">取引を「確定」状態にすると集計されます</div>
                  </div>
                )}
              </div>
            );
          })()}

          {activeTab === 'summary' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="mb-10 border-b border-[var(--border-main)] pb-6">
                <h2 className="text-3xl font-black text-[var(--text-main)] tracking-tight">要約・通知設定</h2>
                <p className="text-[var(--text-muted)] text-sm mt-1">Decision Intelligence & AI Notification Log</p>
              </div>
              <div className="grid gap-10">
                <div className="bg-[var(--bg-card)] rounded-2xl shadow-sm border border-[var(--border-main)] p-6">
                  <h3 className="text-lg font-black text-[var(--text-main)] mb-4 uppercase tracking-tight">判定ロジック設定</h3>
                  <label className="flex items-start gap-5 cursor-pointer group">
                    <div className="pt-1">
                      <input 
                        type="checkbox" 
                        checked={!!state.useReferencePriceForTrigger}
                        onChange={async (e) => {
                           const s = { ...state, useReferencePriceForTrigger: e.target.checked };
                           setState(s);
                           await saveState(s);
                        }}
                        className="w-5 h-5 text-indigo-600 rounded border-[var(--border-main)] focus:ring-indigo-600"
                      />
                    </div>
                    <div>
                      <span className="font-black text-[var(--text-main)] group-hover:text-indigo-600 transition duration-300">投信の参考価格を判定対象に含める</span>
                      <p className="text-xs text-[var(--text-muted)] mt-2 font-bold leading-snug max-w-2xl opacity-70">
                        ONにすると、公式基準価額前でも参考価格を使って判定・要約します。
                      </p>
                    </div>
                  </label>
                </div>
                
                <div className="bg-[var(--bg-card)] rounded-2xl shadow-sm border border-[var(--border-main)] p-6">
                  <div className="flex justify-between items-center mb-4">
                     <h3 className="text-lg font-black text-[var(--text-main)] uppercase tracking-tight">生成済み要約ログ</h3>
                     <button 
                        onClick={async () => {
                           if (!window.confirm("要約ログを消去しますか？\nこの操作は取り消せません")) return;
                           const s = {...state, summaryNotifications: []};
                           setState(s);
                           await saveState(s);
                           showToast("消去しました");
                        }}
                        className="text-[10px] font-black text-rose-500 px-4 py-1.5 bg-rose-500/5 hover:bg-rose-500/10 rounded-xl border border-rose-500/10 transition tracking-widest uppercase"
                     >
                       要約ログを消去
                     </button>
                  </div>
                  <div className="space-y-4 max-h-[600px] overflow-y-auto pr-3 no-scrollbar">
                     {(!state.summaryNotifications || state.summaryNotifications.length === 0) ? (
                        <div className="text-center py-24 bg-[var(--bg-card)] border-2 border-dashed border-[var(--border-main)] rounded-3xl opacity-40 uppercase font-black tracking-widest leading-loose">
                           まだ要約ログはありません<br/>
                           <span className="text-[11px] opacity-80">前場 / 大引けの要約がここに保存されます</span>
                        </div>
                     ) : (
                        state.summaryNotifications.slice().reverse().map(n => {
                           const isMidday = n.type === 'midday' || n.subject.includes('前場');
                           const isClose = n.type === 'close' || n.subject.includes('大引け');
                           const isNight = n.type === 'night' || n.subject.includes('夜');
                           return (
                             <div key={n.id} className="border border-[var(--border-main)] rounded-2xl py-3 px-4 relative group bg-[var(--bg-main)]/30">
                                <div className="flex justify-between items-start mb-1">
                                   <div>
                                      <div className="flex items-center gap-2 mb-2">
                                         <div className="text-[10px] text-[var(--text-muted)] font-black uppercase tracking-widest">{new Date(n.generatedAt).toLocaleString()}</div>
                                         <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter ${
                                           isMidday ? 'bg-blue-500/10 text-blue-500' :
                                           isClose ? 'bg-purple-500/10 text-purple-500' :
                                           isNight ? 'bg-indigo-500/10 text-indigo-400' :
                                           'bg-gray-500/10 text-gray-500'
                                         }`}>
                                           {isMidday ? '前場' : isClose ? '大引け' : isNight ? '夜' : n.type}
                                         </span>
                                      </div>
                                      <div className="font-black text-[var(--text-main)] text-[15px]">{n.subject}</div>
                                   </div>
                                   <button 
                                      onClick={() => {
                                         navigator.clipboard.writeText(`${n.subject}\n\n${n.body}`);
                                         alert('件名と本文をクリップボードにコピーしました！');
                                      }}
                                      className="opacity-0 group-hover:opacity-100 px-4 py-2 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg shadow-xl shadow-indigo-600/20 transition hover:bg-indigo-700"
                                   >
                                      URL・本文をコピー
                                   </button>
                                </div>
                                <pre className="text-xs bg-[var(--bg-main)]/50 py-2 px-3 rounded-xl border border-[var(--border-main)] text-[var(--text-main)] whitespace-pre-wrap font-sans font-medium leading-snug">{n.body}</pre>
                             </div>
                           )
                        })
                     )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="mb-10 border-b border-[var(--border-main)] pb-6">
                <h2 className="text-3xl font-black text-[var(--text-main)] tracking-tight">{LABELS.sections.settings}</h2>
                <p className="text-[var(--text-muted)] text-sm mt-1">System Configuration & Data Integrity</p>
              </div>
              <div className="bg-[var(--bg-card)] rounded-3xl shadow-sm border border-[var(--border-main)] p-10 divide-y divide-[var(--border-main)]">
                <div className="pb-12">
                  <h3 className="text-xl font-black text-[var(--text-main)] mb-2">データのバックアップ</h3>
                  <p className="text-[var(--text-muted)] text-sm mb-8 font-bold opacity-70">全設定、取引履歴をJSON形式でダウンロード・復元します。</p>
                  <div className="flex gap-6">
                    <button onClick={handleExport} className="px-8 py-4 bg-indigo-600 text-white font-black text-[11px] uppercase tracking-widest rounded-2xl hover:bg-indigo-700 transition shadow-xl shadow-indigo-600/20">データを書き出す</button>
                    <button onClick={handleImport} className="px-8 py-4 bg-[var(--bg-main)] border border-[var(--border-main)] text-[var(--text-main)] font-black text-[11px] uppercase tracking-widest rounded-2xl hover:bg-black/5 dark:hover:bg-white/5 transition">データを読み込む</button>
                  </div>
                </div>

                <div className="py-12">
                  <h3 className="text-xl font-black text-[var(--text-main)] mb-3 flex items-center gap-3">
                    <Server size={22} className="text-indigo-500" />
                    Market Snapshot サーバー URL
                  </h3>
                  <div className="text-[var(--text-muted)] text-sm mb-8 font-bold opacity-70 leading-relaxed max-w-2xl">
                    `antigravity-server` との通信エンドポイント。<br />
                    ローカル実行の既定値は <code className="text-[11px] bg-[var(--bg-main)] px-2 py-0.5 rounded font-mono text-indigo-500">http://localhost:3001/market-snapshot</code> です。
                  </div>
                  <div className="flex-1 flex gap-4 items-center relative">
                    <div className="flex-1 relative">
                      <input
                        type="url"
                        value={snapshotUrl}
                        onChange={e => setSnapshotUrlState(e.target.value)}
                        className="w-full bg-[var(--bg-main)] border border-[var(--border-main)] rounded-2xl px-5 py-4 text-sm font-mono text-indigo-500 focus:ring-2 focus:ring-indigo-600/30 focus:outline-none transition-all placeholder:opacity-20"
                        placeholder="http://localhost:3001/market-snapshot"
                      />
                      {snapshotUrlSaved !== 'none' && (
                        <div className={`absolute -top-7 left-1 text-[10px] font-black uppercase tracking-widest animate-in fade-in slide-in-from-bottom-1 duration-300 ${
                          snapshotUrlSaved === 'success' ? 'text-emerald-500' : 'text-rose-500'
                        }`}>
                          {snapshotUrlSaved === 'success' ? '保存しました / 接続確認OK ✓' : '保存しました / 接続に失敗しました ⚠️'}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={async () => {
                        setSnapshotUrl(snapshotUrl);
                        setSnapshotUrlSaved('none');
                        try {
                           // 接続確認 (簡易)
                           const checkUrl = snapshotUrl.replace('/market-snapshot', '/health');
                           const res = await fetch(checkUrl, { method: 'GET', mode: 'cors' });
                           if (res.ok) {
                              setSnapshotUrlSaved('success');
                              showToast("保存しました / 接続確認OK");
                           } else {
                              setSnapshotUrlSaved('error');
                              showToast("保存しました / 接続に失敗しました", "error");
                           }
                        } catch (err) {
                           setSnapshotUrlSaved('error');
                           showToast("接続エラーが発生しました", "error");
                        }
                        setTimeout(() => setSnapshotUrlSaved('none'), 3000);
                      }}
                      className="px-10 py-4 bg-indigo-600 text-white font-black text-[11px] uppercase tracking-widest rounded-2xl hover:bg-indigo-700 transition shadow-xl shadow-indigo-600/20 whitespace-nowrap"
                    >
                      URLを保存
                    </button>
                  </div>
                </div>
                
                <div className="pt-12">
                  <h3 className="text-xl font-black text-rose-500 mb-2">Danger Zone</h3>
                  <div className="text-[var(--text-muted)] text-sm mb-8 font-bold opacity-60">全データを抹消して工場出荷状態に戻します。この操作は取り消せません。事前にバックアップを推奨します。</div>
                  <button 
                    onClick={() => {
                      if(window.confirm("この操作は取り消せません。全てのデータが抹消されます。\n事前にバックアップを推奨します。続行しますか？")) {
                        localStorage.clear();
                        window.location.href = '/';
                      }
                    }}
                    className="px-8 py-4 bg-rose-500/5 border border-rose-500/20 text-rose-500 font-black text-[10px] uppercase tracking-widest rounded-2xl hover:bg-rose-500/10 transition"
                  >
                    全データを初期化
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {isFormOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6 backdrop-blur-sm">
             <div className="bg-[var(--bg-card)] rounded-3xl overflow-hidden w-full max-w-xl shadow-2xl animate-in fade-in zoom-in-95 duration-300">
                 <TransactionForm assets={state.assets} onClose={() => setIsFormOpen(false)} />
             </div>
          </div>
      )}

      {triggerModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6 backdrop-blur-sm">
          {/* ... Modal content ... */}
          <div className="bg-[var(--bg-card)] rounded-3xl w-full max-w-lg shadow-2xl animate-in fade-in zoom-in-95 duration-300 overflow-hidden border border-[var(--border-main)]">
            <div className="flex justify-between items-center p-6 border-b border-[var(--border-main)]">
              <h3 className="font-black text-[var(--text-main)] text-[18px] tracking-tight">{LABELS.actions.addTrigger}</h3>
              <button onClick={() => setTriggerModal(null)} className="text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"><X size={20} /></button>
            </div>
            <div className="p-8 space-y-6">
              <div className="text-[10px] text-indigo-500 font-black bg-indigo-500/5 px-4 py-2 rounded-xl border border-indigo-500/10 tracking-widest uppercase">
                対象資産: <span className="text-[var(--text-main)] ml-1">{state.assets.find(a => a.id === triggerModal.assetId)?.name}</span>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2 ml-1">売買方向</label>
                  <select
                    value={newTrigger.direction}
                    onChange={e => setNewTrigger(p => ({ ...p, direction: e.target.value as DirectionType }))}
                    className="w-full bg-[var(--bg-main)] border border-[var(--border-main)] rounded-xl px-4 py-3 text-sm font-bold text-[var(--text-main)] outline-none focus:ring-2 focus:ring-indigo-600/30 transition-all appearance-none cursor-pointer"
                  >
                    <option value="buy">買い</option>
                    <option value="sell">売り</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2 ml-1">条件タイプ</label>
                  <select
                    value={newTrigger.thresholdType}
                    onChange={e => setNewTrigger(p => ({ ...p, thresholdType: e.target.value as ThresholdType }))}
                    className="w-full bg-[var(--bg-main)] border border-[var(--border-main)] rounded-xl px-4 py-3 text-sm font-bold text-[var(--text-main)] outline-none focus:ring-2 focus:ring-indigo-600/30 transition-all appearance-none cursor-pointer"
                  >
                    <option value="lte">以下になったら</option>
                    <option value="gte">以上になったら</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2 ml-1">閾値 (円)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="例: 15000"
                    value={newTrigger.thresholdValue}
                    onChange={e => setNewTrigger(p => ({ ...p, thresholdValue: e.target.value }))}
                    className="w-full bg-[var(--bg-main)] border border-[var(--border-main)] rounded-xl px-4 py-3 text-sm font-mono font-black text-[var(--text-main)] outline-none focus:ring-2 focus:ring-indigo-600/30 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2 ml-1">
                    予定数量 ({state.assets.find(a => a.id === triggerModal.assetId)?.unitLabel})
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="例: 100"
                    value={newTrigger.quantityPlan}
                    onChange={e => setNewTrigger(p => ({ ...p, quantityPlan: e.target.value }))}
                    className="w-full bg-[var(--bg-main)] border border-[var(--border-main)] rounded-xl px-4 py-3 text-sm font-mono font-black text-[var(--text-main)] outline-none focus:ring-2 focus:ring-indigo-600/30 transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-2 ml-1">ラベル (任意)</label>
                <input
                  type="text"
                  placeholder="例: 底値拾い第一弾"
                  value={newTrigger.label}
                  onChange={e => setNewTrigger(p => ({ ...p, label: e.target.value }))}
                  className="w-full bg-[var(--bg-main)] border border-[var(--border-main)] rounded-xl px-4 py-3 text-sm font-black text-[var(--text-main)] outline-none focus:ring-2 focus:ring-indigo-600/30 transition-all"
                />
              </div>
            </div>
            <div className="flex justify-end gap-4 p-8 border-t border-[var(--border-main)] bg-[var(--bg-main)]/10">
              <button 
                onClick={() => setTriggerModal(null)} 
                className="px-6 py-3 bg-[var(--bg-main)] text-[var(--text-muted)] font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition"
              >
                {LABELS.actions.cancel}
              </button>
              <button
                onClick={handleAddTrigger}
                className="px-8 py-3 bg-indigo-600 text-white font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition shadow-xl shadow-indigo-600/20"
              >
                {LABELS.actions.register}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Toast */}
      {toast.type !== 'none' && (
        <div className="fixed bottom-10 right-10 z-[100] animate-in fade-in slide-in-from-right-10 duration-500">
           <div className={`px-8 py-4 rounded-3xl shadow-2xl border flex items-center gap-4 ${
             toast.type === 'success' 
              ? 'bg-slate-900 text-emerald-400 border-emerald-500/30' 
              : 'bg-slate-900 text-rose-400 border-rose-500/30'
           }`}>
             <div className={`w-2 h-2 rounded-full animate-pulse ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
             <span className="text-xs font-black uppercase tracking-[0.2em]">{toast.message}</span>
           </div>
        </div>
      )}
    </div>
  )
}

export default OptionsPage
