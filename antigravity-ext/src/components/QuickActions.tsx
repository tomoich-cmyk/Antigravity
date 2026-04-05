import React from 'react';
import { LABELS } from '../constants/labels';

interface Props {
  onSelectAction: (assetId: string, type: string, quantity: number) => void;
}

export const QuickActions: React.FC<Props> = ({ onSelectAction }) => {
  return (
    <div className="bg-[var(--bg-card)] p-4 rounded-2xl shadow-xl border border-[var(--border-main)] transition-all duration-300">
      <h3 className="text-[10px] font-black text-[var(--text-muted)] mb-3 flex items-center gap-2 uppercase tracking-[0.2em]">⚡ {LABELS.sections.quickActions}</h3>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => onSelectAction('asset-gmopg', 'buy', 10)} className="text-left text-[11px] bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-bold px-3 py-2.5 rounded-xl transition border border-indigo-500/20 active:scale-95">
          GMOPG 10株買い
        </button>
        <button onClick={() => onSelectAction('asset-gmopg', 'buy', 25)} className="text-left text-[11px] bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-bold px-3 py-2.5 rounded-xl transition border border-indigo-500/20 active:scale-95">
          GMOPG 25株買い
        </button>
        <button onClick={() => onSelectAction('asset-ab', 'sell', 500000)} className="text-left text-[11px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold px-3 py-2.5 rounded-xl transition border border-rose-500/20 active:scale-95">
          AB 50万口売り
        </button>
        <button onClick={() => onSelectAction('asset-unext', 'sell', 200)} className="text-left text-[11px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold px-3 py-2.5 rounded-xl transition border border-rose-500/20 active:scale-95">
          U-NEXT 200株売り
        </button>
        <button onClick={() => onSelectAction('asset-invesco', 'distribution', 0)} className="text-left text-[11px] bg-teal-500/10 hover:bg-teal-500/20 text-teal-600 dark:text-teal-400 font-bold px-3 py-2.5 rounded-xl transition border border-teal-500/20 active:scale-95">
          インベスコ 分配金
        </button>
        <button onClick={() => onSelectAction('cash', 'cash', 0)} className="text-left text-[11px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold px-3 py-2.5 rounded-xl transition border border-emerald-500/20 active:scale-95">
          💵 現金残高
        </button>
      </div>
    </div>
  );
}
