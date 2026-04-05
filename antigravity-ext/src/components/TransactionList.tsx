import React, { useState, useMemo, useEffect } from 'react';
import type { Asset, Transaction, TransactionType, TransactionStatus } from '../types';
import { softDeleteTransaction } from '../lib/portfolio';
import { TransactionForm } from './TransactionForm';
import { Edit2, Trash2, Inbox, Calendar, User, Tag, Plus } from 'lucide-react';
import { LABELS } from '../constants/labels';

interface Props {
  assets: Asset[];
  transactions: Transaction[];
}

type PeriodType = '30d' | '90d' | '1y' | 'all';

interface FilterState {
  type: TransactionType | 'all';
  assetId: string | 'all';
  period: PeriodType;
}

const STORAGE_KEY = 'antigravity_journal_filters';

export const TransactionList: React.FC<Props> = ({ assets, transactions }) => {
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);

  // Filter State with localStorage persistence
  const [filters, setFilters] = useState<FilterState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse filters', e);
      }
    }
    return { type: 'all', assetId: 'all', period: '30d' };
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  const handleDelete = async (id: string) => {
    if (confirm("この取引を削除します。元に戻せません。よろしいですか？（平均単価・保有数量は自動で再計算されます）")) {
      await softDeleteTransaction(id);
    }
  };

  const getTypeBadge = (type: TransactionType) => {
    switch (type) {
      case 'buy': return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/10">{LABELS.transaction.buy}</span>;
      case 'sell': return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/10">{LABELS.transaction.sell}</span>;
      case 'distribution': return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/10">{LABELS.transaction.distribution}</span>;
      case 'adjustment': return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/10">{LABELS.transaction.adjustment}</span>;
      default: return type;
    }
  };

  const getStatusBadge = (status: TransactionStatus) => {
    switch (status) {
      case 'confirmed': return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/10">{LABELS.transaction.confirmed}</span>;
      case 'planned': return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/10">{LABELS.transaction.planned}</span>;
      default: return status;
    }
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(val);

  // Sorting & Filtering Logic
  const allActiveTxs = useMemo(() => {
    return transactions.filter(t => !t.isDeleted).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions]);

  const filteredTxs = useMemo(() => {
    const now = new Date();
    return allActiveTxs.filter(tx => {
      // Type Filter
      if (filters.type !== 'all' && tx.type !== filters.type) return false;
      
      // Asset Filter
      if (filters.assetId !== 'all' && tx.assetId !== filters.assetId) return false;
      
      // Period Filter
      if (filters.period !== 'all') {
        const txDate = new Date(tx.date);
        const diffDays = (now.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24);
        if (filters.period === '30d' && diffDays > 30) return false;
        if (filters.period === '90d' && diffDays > 90) return false;
        if (filters.period === '1y' && diffDays > 365) return false;
      }
      return true;
    });
  }, [allActiveTxs, filters]);

  // Summary Logic
  const summary = useMemo(() => {
    const counts = { total: filteredTxs.length, buy: 0, sell: 0, distribution: 0, adjustment: 0 };
    filteredTxs.forEach(tx => {
      if (tx.type === 'buy') counts.buy++;
      else if (tx.type === 'sell') counts.sell++;
      else if (tx.type === 'distribution') counts.distribution++;
      else if (tx.type === 'adjustment') counts.adjustment++;
    });
    return counts;
  }, [filteredTxs]);

  const totalPossible = allActiveTxs.length;

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <div className="bg-[var(--bg-card)] rounded-2xl p-2 md:p-3 border border-[var(--border-main)] shadow-sm">
        <div className="flex flex-wrap items-center gap-2 md:gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-white/5 transition duration-200">
            <Tag size={13} className="text-indigo-500 opacity-70" />
            <select 
              value={filters.type}
              onChange={e => setFilters(p => ({ ...p, type: e.target.value as any }))}
              className="bg-transparent border-none text-[11px] font-black text-[var(--text-main)] focus:ring-0 cursor-pointer uppercase tracking-widest p-0 pr-6"
            >
              <option value="all" className="bg-[var(--bg-card)] text-[var(--text-main)]">{LABELS.transaction.type}: 全て</option>
              <option value="buy" className="bg-[var(--bg-card)] text-[var(--text-main)]">{LABELS.transaction.buy}のみ</option>
              <option value="sell" className="bg-[var(--bg-card)] text-[var(--text-main)]">{LABELS.transaction.sell}のみ</option>
              <option value="distribution" className="bg-[var(--bg-card)] text-[var(--text-main)]">{LABELS.transaction.distribution}のみ</option>
              <option value="adjustment" className="bg-[var(--bg-card)] text-[var(--text-main)]">{LABELS.transaction.adjustment}のみ</option>
            </select>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-white/5 transition duration-200">
            <User size={13} className="text-indigo-500 opacity-70" />
            <select 
              value={filters.assetId}
              onChange={e => setFilters(p => ({ ...p, assetId: e.target.value }))}
              className="bg-transparent border-none text-[11px] font-black text-[var(--text-main)] focus:ring-0 cursor-pointer uppercase tracking-widest p-0 pr-6"
            >
              <option value="all" className="bg-[var(--bg-card)] text-[var(--text-main)]">銘柄: 全銘柄</option>
              {assets.map(a => (
                <option key={a.id} value={a.id} className="bg-[var(--bg-card)] text-[var(--text-main)]">{a.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-white/5 transition duration-200">
            <Calendar size={13} className="text-indigo-500 opacity-70" />
            <select 
              value={filters.period}
              onChange={e => setFilters(p => ({ ...p, period: e.target.value as any }))}
              className="bg-transparent border-none text-[11px] font-black text-[var(--text-main)] focus:ring-0 cursor-pointer uppercase tracking-widest p-0 pr-6"
            >
              <option value="30d" className="bg-[var(--bg-card)] text-[var(--text-main)]">期間: 直近30日</option>
              <option value="90d" className="bg-[var(--bg-card)] text-[var(--text-main)]">期間: 直近90日</option>
              <option value="1y" className="bg-[var(--bg-card)] text-[var(--text-main)]">期間: 過去1年</option>
              <option value="all" className="bg-[var(--bg-card)] text-[var(--text-main)]">期間: 全て</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--border-main)] relative overflow-hidden group">
           <div className="absolute inset-0 bg-indigo-500/5 opacity-0 group-hover:opacity-100 transition duration-500"></div>
           <div className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-1 opacity-60 relative z-10">総件数</div>
           <div className="flex items-baseline gap-2 relative z-10">
             <span className="text-lg font-black text-[var(--text-main)]">{summary.total}</span>
             <span className="text-[10px] font-bold text-[var(--text-muted)] opacity-50"> / 全履歴 {totalPossible}件</span>
           </div>
        </div>
        <div className="bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--border-main)]">
           <div className="text-[9px] font-black text-blue-500/80 uppercase tracking-widest mb-1">{LABELS.transaction.buy}</div>
           <div className="text-lg font-black text-blue-500">{summary.buy}</div>
        </div>
        <div className="bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--border-main)]">
           <div className="text-[9px] font-black text-rose-500/80 uppercase tracking-widest mb-1">{LABELS.transaction.sell}</div>
           <div className="text-lg font-black text-rose-500">{summary.sell}</div>
        </div>
        <div className="bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--border-main)]">
           <div className="text-[9px] font-black text-teal-500/80 uppercase tracking-widest mb-1">{LABELS.transaction.distribution}</div>
           <div className="text-lg font-black text-teal-500">{summary.distribution}</div>
        </div>
        <div className="bg-[var(--bg-card)] rounded-xl p-3 border border-[var(--border-main)]">
           <div className="text-[9px] font-black text-purple-500/80 uppercase tracking-widest mb-1">{LABELS.transaction.adjustment}</div>
           <div className="text-lg font-black text-purple-500">{summary.adjustment}</div>
        </div>
      </div>

      {/* History Table */}
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-main)] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-[var(--bg-main)]/50 text-[var(--text-muted)] border-b border-[var(--border-main)]">
              <tr>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-[0.2em]">{LABELS.asset.date}</th>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-[0.2em]">銘柄</th>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-[0.2em]">{LABELS.transaction.type}</th>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-[0.2em] text-center">{LABELS.transaction.status}</th>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-[0.2em] text-right">{LABELS.asset.quantity}</th>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-[0.2em] text-right">単価/価格</th>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-[0.2em]">{LABELS.asset.note}</th>
                <th className="px-6 py-4 font-black text-[10px] uppercase tracking-[0.2em] text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-main)]">
              {filteredTxs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-20 text-center bg-white/2">
                    <div className="flex flex-col items-center gap-6">
                      <div className="opacity-30">
                        <Inbox size={48} className="text-[var(--text-muted)]" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-base font-black text-[var(--text-main)] uppercase tracking-widest">まだ取引履歴はありません</h3>
                        <p className="text-xs font-bold text-[var(--text-muted)] opacity-60">買付・売却・分配金などの履歴がここに並びます</p>
                      </div>
                      <button 
                         onClick={() => setIsAddingNew(true)}
                         className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[11px] uppercase tracking-widest rounded-xl transition shadow-xl shadow-indigo-600/20 active:scale-95 flex items-center gap-2"
                      >
                         <Plus size={14} /> 最初の取引を登録する
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTxs.map(tx => {
                  const asset = assets.find(a => a.id === tx.assetId);
                  return (
                    <tr key={tx.id} className="transition-colors hover:bg-white/2 group">
                      <td className="px-6 py-4 whitespace-nowrap font-mono text-[11px] text-[var(--text-muted)] group-hover:text-[var(--text-main)] transition-colors">{tx.date}</td>
                      <td className="px-6 py-4 font-black text-[var(--text-main)] leading-tight">{asset?.name || '不明'}</td>
                      <td className="px-6 py-4">{getTypeBadge(tx.type)}</td>
                      <td className="px-6 py-4 text-center">{getStatusBadge(tx.status)}</td>
                      <td className="px-6 py-4 text-right font-mono font-black text-[var(--text-main)]">
                        {tx.type === 'distribution' ? '—' : tx.quantity.toLocaleString()}{asset?.unitLabel}
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-black text-[var(--text-main)]">
                        {tx.type === 'distribution' ? formatCurrency(tx.price * (tx.quantity / (asset?.type === 'fund' ? 10000 : 1))) : formatCurrency(tx.price)}
                      </td>
                      <td className="px-6 py-4 max-w-[200px]">
                        <div 
                          className="text-xs text-[var(--text-muted)] font-bold truncate group-hover:text-[var(--text-main)] transition-colors cursor-help"
                          title={tx.note}
                        >
                          {tx.note || '—'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center gap-4">
                          <button 
                            onClick={() => setEditingTx(tx)} 
                            className="text-indigo-400/60 hover:text-indigo-400 transition transform hover:scale-110" 
                            title="編集"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            onClick={() => handleDelete(tx.id!)} 
                            className="text-rose-400/60 hover:text-rose-400 transition transform hover:scale-110" 
                            title="削除"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(editingTx || isAddingNew) && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-in fade-in backdrop-blur-sm duration-300">
           <div className="bg-[var(--bg-card)] rounded-3xl overflow-hidden w-full max-w-xl shadow-2xl border border-[var(--border-main)]">
             <TransactionForm 
                assets={assets} 
                existingTransaction={editingTx || undefined} 
                onClose={() => {
                   setEditingTx(null);
                   setIsAddingNew(false);
                }} 
             />
           </div>
        </div>
      )}
    </div>
  )
}
