import React from 'react';
import { X, HelpCircle, TrendingUp, AlertTriangle, Timer, CheckCircle2 } from 'lucide-react';
import { LABELS } from '../constants/labels';
import { DECISION_LABEL_MAP } from '../constants/enums';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const JudgmentLegend: React.FC<Props> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-[var(--bg-card)] border border-[var(--border-main)] rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-6 border-b border-[var(--border-main)] flex justify-between items-center bg-indigo-600 dark:bg-indigo-500 text-white">
          <div className="flex items-center gap-2">
            <HelpCircle size={20} />
            <h3 className="font-black text-lg tracking-tight">{LABELS.app.decisionLogic}</h3>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-1 rounded-full transition">
            <X size={24} />
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          <section className="space-y-4">
            <div className="flex gap-4 items-start">
               <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 text-emerald-500">
                  <TrendingUp size={24} />
               </div>
               <div>
                  <h4 className="font-black text-sm text-[var(--text-main)] mb-1">{DECISION_LABEL_MAP.strong_buy_candidate}</h4>
                  <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                    現在の価格が設定した「基準価格」を大幅に下回り、環境スコアが強力な追い風の場合に表示されます。
                  </p>
               </div>
            </div>

            <div className="flex gap-4 items-start">
               <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center shrink-0 text-indigo-500">
                  <CheckCircle2 size={24} />
               </div>
               <div>
                  <h4 className="font-black text-sm text-[var(--text-main)] mb-1">{DECISION_LABEL_MAP.buy_candidate}</h4>
                  <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                    価格が判断帯に入っており、環境が「中立」以上の場合に推奨されます。
                  </p>
               </div>
            </div>

            <div className="flex gap-4 items-start">
               <div className="w-10 h-10 rounded-full bg-slate-500/10 flex items-center justify-center shrink-0 text-[var(--text-muted)]">
                  <Timer size={24} />
               </div>
               <div>
                  <h4 className="font-black text-sm text-[var(--text-main)] mb-1">{LABELS.status.watch}</h4>
                  <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                    価格が基準付近にあるか、判断帯を外れている場合、または環境が改善するのを待つべき状態です。
                  </p>
               </div>
            </div>

            <div className="flex gap-4 items-start">
               <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0 text-rose-500">
                  <AlertTriangle size={24} />
               </div>
               <div>
                  <h4 className="font-black text-sm text-[var(--text-main)] mb-1">{LABELS.status.avoid}</h4>
                  <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                    指標の異常悪化や、環境スコアが大幅に低下した場合に表示されます。追加投資を控えるべき合図です。
                  </p>
               </div>
            </div>
          </section>

          <div className="bg-[var(--bg-main)] p-4 rounded-2xl border border-[var(--border-main)]">
            <h5 className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mb-2">用語・仕組みの解説</h5>
            <div className="space-y-2">
              <p className="text-[10px] text-[var(--text-muted)] leading-normal italic">
                <span className="font-bold text-indigo-500">{LABELS.trigger.basePrice}</span>: 人間が設定した売買の基準となる価格です。判断の起点となります。
              </p>
              <p className="text-[10px] text-[var(--text-muted)] leading-normal italic">
                <span className="font-bold text-indigo-500">{LABELS.asset.environmentScore}</span>: ドル円や主要指数を統合し、「追い風・中立・逆風」を算出した現在の投資環境の良し悪しです。
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 bg-[var(--bg-main)] border-t border-[var(--border-main)]">
          <button 
            onClick={onClose}
            className="w-full py-3 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition shadow-lg shadow-indigo-600/20"
          >
            {LABELS.actions.understand}
          </button>
        </div>
      </div>
    </div>
  );
};
