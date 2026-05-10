import React, { useState } from 'react';
import { LABELS } from '../constants/labels';
import type { Transaction, Asset } from '../types';

interface Props {
  onSelectAction: (assetId: string, type: string, quantity: number) => void;
  transactions?: Transaction[];
  assets?: Asset[];
}

interface FundDistSummary {
  assetId: string;
  name: string;
  lastDate: string;
  lastOrdinary: number;   // 最終回の普通分配金合計円
  lastSpecial: number;    // 最終回の特別分配金合計円
  ytdOrdinary: number;    // 今年の普通分配金累計
  ytdSpecial: number;     // 今年の特別分配金累計
  allTimeOrdinary: number;
  allTimeSpecial: number;
  count: number;
}

function buildDistSummaries(
  assets: Asset[],
  transactions: Transaction[]
): FundDistSummary[] {
  const funds = assets.filter(a => a.type === 'fund');
  const thisYear = new Date().getFullYear();

  return funds.map(fund => {
    const distTxs = transactions
      .filter(tx => tx.assetId === fund.id && !tx.isDeleted &&
        (tx.type === 'ordinary_distribution' || tx.type === 'special_distribution' || tx.type === 'distribution'))
      .sort((a, b) => a.date.localeCompare(b.date));

    let allTimeOrdinary = 0;
    let allTimeSpecial = 0;
    let ytdOrdinary = 0;
    let ytdSpecial = 0;
    let lastDate = '';
    let lastOrdinary = 0;
    let lastSpecial = 0;

    const multiplier = fund.type === 'fund' ? 10000 : 1;

    for (const tx of distTxs) {
      const isThisYear = tx.date.startsWith(`${thisYear}`);
      let ord = 0;
      let spec = 0;

      if (tx.type === 'ordinary_distribution') {
        ord = (tx.price * (tx.quantity / multiplier));
      } else if (tx.type === 'special_distribution') {
        spec = (tx.price * (tx.quantity / multiplier));
      } else if (tx.type === 'distribution' && tx.distributionBreakdown) {
        ord = tx.distributionBreakdown.ordinary;
        spec = tx.distributionBreakdown.special;
      } else {
        // legacy: price * quantity / multiplier
        ord = (tx.price * (tx.quantity / multiplier));
      }

      allTimeOrdinary += ord;
      allTimeSpecial += spec;
      if (isThisYear) {
        ytdOrdinary += ord;
        ytdSpecial += spec;
      }
    }

    // 直近の分配金（最後の日付のもの）
    if (distTxs.length > 0) {
      const last = distTxs[distTxs.length - 1];
      lastDate = last.date;

      // Collect all txs on that same date
      const lastDayTxs = distTxs.filter(tx => tx.date === lastDate);
      for (const tx of lastDayTxs) {
        if (tx.type === 'ordinary_distribution') {
          lastOrdinary += (tx.price * (tx.quantity / multiplier));
        } else if (tx.type === 'special_distribution') {
          lastSpecial += (tx.price * (tx.quantity / multiplier));
        } else if (tx.type === 'distribution' && tx.distributionBreakdown) {
          lastOrdinary += tx.distributionBreakdown.ordinary;
          lastSpecial += tx.distributionBreakdown.special;
        }
      }
    }

    return {
      assetId: fund.id,
      name: fund.name,
      lastDate,
      lastOrdinary,
      lastSpecial,
      ytdOrdinary,
      ytdSpecial,
      allTimeOrdinary,
      allTimeSpecial,
      count: distTxs.length,
    };
  });
}

const fmt = (v: number) => Math.round(v).toLocaleString();

export const QuickActions: React.FC<Props> = ({ onSelectAction, transactions = [], assets = [] }) => {
  const [showDistHistory, setShowDistHistory] = useState(false);

  const summaries = (assets.length > 0 && transactions.length > 0)
    ? buildDistSummaries(assets, transactions)
    : [];

  const hasDist = summaries.some(s => s.count > 0);

  return (
    <div className="bg-[var(--bg-card)] p-4 rounded-2xl shadow-xl border border-[var(--border-main)] transition-all duration-300">
      <h3 className="text-[10px] font-black text-[var(--text-muted)] mb-3 flex items-center gap-2 uppercase tracking-[0.2em]">⚡ {LABELS.sections.quickActions}</h3>

      {/* ── 買い ── */}
      <div className="mb-2">
        <div className="text-[8px] font-black text-indigo-400/70 uppercase tracking-widest mb-1 px-0.5">買い</div>
        <div className="grid grid-cols-2 gap-1.5">
          <button onClick={() => onSelectAction('asset-gmopg', 'buy', 10)} className="text-left text-[11px] bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-bold px-3 py-2.5 rounded-xl transition border border-indigo-500/20 active:scale-95">
            GMOPG 10株買い
          </button>
          <button onClick={() => onSelectAction('asset-gmopg', 'buy', 25)} className="text-left text-[11px] bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-bold px-3 py-2.5 rounded-xl transition border border-indigo-500/20 active:scale-95">
            GMOPG 25株買い
          </button>
        </div>
      </div>

      {/* ── 売り ── */}
      <div className="mb-2">
        <div className="text-[8px] font-black text-rose-400/70 uppercase tracking-widest mb-1 px-0.5">売り</div>
        <div className="grid grid-cols-2 gap-1.5">
          <button onClick={() => onSelectAction('asset-ab', 'sell', 500000)} className="text-left text-[11px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold px-3 py-2.5 rounded-xl transition border border-rose-500/20 active:scale-95">
            AB 50万口売り
          </button>
          <button onClick={() => onSelectAction('asset-unext', 'sell', 200)} className="text-left text-[11px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold px-3 py-2.5 rounded-xl transition border border-rose-500/20 active:scale-95">
            U-NEXT 200株売り
          </button>
        </div>
      </div>

      {/* ── 分配金 ── */}
      <div className="mb-2">
        <div className="text-[8px] font-black text-teal-400/70 uppercase tracking-widest mb-1 px-0.5">分配金</div>
        <div className="grid grid-cols-3 gap-1.5">
          <button onClick={() => onSelectAction('asset-ab', 'distribution', 0)} className="text-left text-[11px] bg-teal-500/10 hover:bg-teal-500/20 text-teal-600 dark:text-teal-400 font-bold px-2 py-2.5 rounded-xl transition border border-teal-500/20 active:scale-95">
            AB<br /><span className="text-[9px] font-medium opacity-80">分配金</span>
          </button>
          <button onClick={() => onSelectAction('asset-invesco', 'distribution', 0)} className="text-left text-[11px] bg-teal-500/10 hover:bg-teal-500/20 text-teal-600 dark:text-teal-400 font-bold px-2 py-2.5 rounded-xl transition border border-teal-500/20 active:scale-95">
            インベスコ<br /><span className="text-[9px] font-medium opacity-80">分配金</span>
          </button>
          <button onClick={() => onSelectAction('asset-wcm', 'distribution', 0)} className="text-left text-[11px] bg-teal-500/10 hover:bg-teal-500/20 text-teal-600 dark:text-teal-400 font-bold px-2 py-2.5 rounded-xl transition border border-teal-500/20 active:scale-95">
            WCM<br /><span className="text-[9px] font-medium opacity-80">分配金</span>
          </button>
        </div>
      </div>

      {/* ── その他 ── */}
      <div className="mb-3">
        <div className="text-[8px] font-black text-emerald-400/70 uppercase tracking-widest mb-1 px-0.5">その他</div>
        <div className="grid grid-cols-2 gap-1.5">
          <button onClick={() => onSelectAction('cash', 'cash', 0)} className="text-left text-[11px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold px-3 py-2.5 rounded-xl transition border border-emerald-500/20 active:scale-95">
            💵 現金残高
          </button>
        </div>
      </div>

      {/* ── 分配金履歴サマリー ── */}
      {hasDist && (
        <div className="border-t border-[var(--border-main)] pt-2.5 mt-1">
          <button
            className="flex items-center justify-between w-full text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-main)] transition mb-1"
            onClick={() => setShowDistHistory(v => !v)}
          >
            <span>📊 分配金トレンド</span>
            <span>{showDistHistory ? '▾' : '▸'}</span>
          </button>

          {showDistHistory && (
            <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
              {summaries.filter(s => s.count > 0).map(s => (
                <div key={s.assetId} className="bg-[var(--bg-main)] rounded-xl p-2 border border-[var(--border-main)]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-black text-[var(--text-main)]">{s.name}</span>
                    <span className="text-[8px] text-[var(--text-muted)] font-bold">{s.count}回</span>
                  </div>
                  {s.lastDate && (
                    <div className="flex items-center justify-between text-[9px] mb-0.5">
                      <span className="text-[var(--text-muted)]">直近 {s.lastDate}</span>
                      <div className="flex gap-1.5">
                        {s.lastOrdinary > 0 && (
                          <span className="text-emerald-500 font-black">普通 ¥{fmt(s.lastOrdinary)}</span>
                        )}
                        {s.lastSpecial > 0 && (
                          <span className="text-amber-500 font-black">特別 ¥{fmt(s.lastSpecial)}</span>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[8px] text-[var(--text-muted)] border-t border-[var(--border-main)] pt-1 mt-1">
                    <span>今年計</span>
                    <div className="flex gap-1.5">
                      {s.ytdOrdinary > 0 && (
                        <span className="text-emerald-400 font-bold">¥{fmt(s.ytdOrdinary)}</span>
                      )}
                      {s.ytdSpecial > 0 && (
                        <span className="text-amber-400 font-bold">特 ¥{fmt(s.ytdSpecial)}</span>
                      )}
                      {s.ytdOrdinary === 0 && s.ytdSpecial === 0 && (
                        <span className="opacity-50">—</span>
                      )}
                    </div>
                    <span className="opacity-60">/ 累計 ¥{fmt(s.allTimeOrdinary + s.allTimeSpecial)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
