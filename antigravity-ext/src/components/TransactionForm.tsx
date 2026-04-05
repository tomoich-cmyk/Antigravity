import React, { useState } from 'react';
import type { Asset, Transaction, TransactionType, TransactionStatus } from '../types';
import { appendTransaction, updateTransaction } from '../lib/portfolio';
import { validateTransactionInput } from '../lib/validators';
import { LABELS } from '../constants/labels';

interface Props {
  assets: Asset[];
  initialAssetId?: string;
  initialType?: TransactionType;
  existingTransaction?: Transaction;
  onClose: () => void;
}

export const TransactionForm: React.FC<Props> = ({ assets, initialAssetId, initialType, existingTransaction, onClose }) => {
  const [assetId, setAssetId] = useState(existingTransaction?.assetId || initialAssetId || (assets[0] ? assets[0].id : ''));
  const [type, setType] = useState<TransactionType>(existingTransaction?.type || initialType || 'buy');
  const [date, setDate] = useState(existingTransaction?.date || new Date().toISOString().split('T')[0]);
  const [quantity, setQuantity] = useState(existingTransaction?.quantity?.toString() || '');
  const [price, setPrice] = useState(existingTransaction?.price?.toString() || '');
  const [fee, setFee] = useState(existingTransaction?.fee?.toString() || '');
  const [tax, setTax] = useState(existingTransaction?.tax?.toString() || '');
  const [note, setNote] = useState(existingTransaction?.note || '');
  const [status, setStatus] = useState<TransactionStatus>(existingTransaction?.status || 'confirmed');
  const [ordinaryDist, setOrdinaryDist] = useState(existingTransaction?.distributionBreakdown?.ordinary?.toString() || '');
  const [specialDist, setSpecialDist] = useState(existingTransaction?.distributionBreakdown?.special?.toString() || '');

  const [showDetailed, setShowDetailed] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const selectedAsset = assets.find(a => a.id === assetId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const qtyNum = parseFloat(quantity);
    const priceNum = parseFloat(price);
    const feeNum = fee ? parseFloat(fee) : 0;
    const taxNum = tax ? parseFloat(tax) : 0;
    const ordDistNum = ordinaryDist ? parseFloat(ordinaryDist) : 0;
    const specDistNum = specialDist ? parseFloat(specialDist) : 0;

    const txBase: Transaction = {
      id: existingTransaction?.id || crypto.randomUUID(),
      assetId,
      type,
      date,
      quantity: isNaN(qtyNum) ? 0 : qtyNum,
      price: isNaN(priceNum) ? 0 : priceNum,
      fee: isNaN(feeNum) ? 0 : feeNum,
      tax: isNaN(taxNum) ? 0 : taxNum,
      realizedPnL: 0,
      note,
      status,
      createdAt: existingTransaction?.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    if (type === 'distribution') {
        txBase.distributionBreakdown = { ordinary: ordDistNum, special: specDistNum };
    }

    // バリデーション
    const validation = validateTransactionInput(txBase);
    if (!validation.valid) {
      setFormErrors(validation.errors);
      return;
    }
    setFormErrors({});

    if (existingTransaction && existingTransaction.id) {
      await updateTransaction(txBase);
    } else {
      await appendTransaction(txBase);
    }
    onClose();
  };

  const isDistMode = type === 'distribution';

  return (
    <div className="bg-[var(--bg-card)] p-6 md:p-8 rounded-t-3xl md:rounded-3xl border-t md:border border-[var(--border-main)] shadow-2xl relative max-w-xl mx-auto w-full animate-in slide-in-from-bottom-4">
      <h3 className="text-xl font-black mb-6 flex items-center justify-between text-[var(--text-main)] tracking-tight">
        <span className="flex items-center gap-2">
          {existingTransaction?.id ? `📝 ${LABELS.app.editTransaction}` : (isDistMode ? '📊 分配金入力' : `📝 ${LABELS.app.newTransaction}`)}
        </span>
        <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors p-1">✕</button>
      </h3>
      
      <form onSubmit={handleSubmit} className="space-y-5 text-sm">
        {/* Basic Info: Asset & Type */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[var(--text-muted)] font-black text-[10px] uppercase tracking-widest mb-1.5 ml-1">銘柄</label>
            <select 
              className="flex h-12 w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-2 text-sm text-[var(--text-main)] font-bold focus:outline-none focus:ring-2 focus:ring-indigo-600/50 transition-all appearance-none cursor-pointer disabled:opacity-50" 
              value={assetId} onChange={e => setAssetId(e.target.value)}
              disabled={isDistMode}
            >
              {assets.map(a => <option key={a.id} value={a.id} className="bg-[var(--bg-card)]">{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[var(--text-muted)] font-black text-[10px] uppercase tracking-widest mb-1.5 ml-1">{LABELS.asset.type}</label>
            <select 
              className="flex h-12 w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-2 text-sm text-[var(--text-main)] font-bold focus:outline-none focus:ring-2 focus:ring-indigo-600/50 transition-all appearance-none cursor-pointer disabled:opacity-50" 
              value={type} onChange={e => {
                setType(e.target.value as TransactionType);
                if (e.target.value === 'distribution') setStatus('confirmed');
              }}
              disabled={isDistMode}
            >
              <option value="buy" className="bg-[var(--bg-card)]">{LABELS.trigger.buy}</option>
              <option value="sell" className="bg-[var(--bg-card)]">{LABELS.trigger.sell}</option>
              {selectedAsset?.type === 'fund' && <option value="distribution" className="bg-[var(--bg-card)]">分配金</option>}
              <option value="adjustment" className="bg-[var(--bg-card)]">残高調整</option>
            </select>
          </div>
        </div>

        {/* Date Row */}
        <div>
          <label className="block text-[var(--text-muted)] font-black text-[10px] uppercase tracking-widest mb-1.5 ml-1">{LABELS.asset.date}</label>
          <input 
            type="date" 
            className="flex h-12 w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-2 text-sm text-[var(--text-main)] font-bold focus:outline-none focus:ring-2 focus:ring-indigo-600/50 transition-all" 
            value={date} onChange={e => setDate(e.target.value)} 
          />
        </div>

        {/* Specialized Distribution UI */}
        {isDistMode ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-emerald-600/5 p-4 rounded-3xl border border-emerald-600/10 shadow-inner">
               <div>
                  <div className="flex justify-between items-baseline mb-1.5 px-1">
                    <label className="text-emerald-600 dark:text-emerald-400 font-black text-[10px] uppercase tracking-widest">{LABELS.asset.ordinaryDist}</label>
                    <span className="text-[9px] text-[var(--text-muted)] font-bold">課税対象</span>
                  </div>
                  <input 
                    type="number" step="1" 
                    placeholder="0"
                    className="flex h-12 w-full rounded-xl border border-emerald-600/20 bg-[var(--bg-card)] px-4 py-2 text-[var(--text-main)] font-mono font-black placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-emerald-500/30 transition-all" 
                    value={ordinaryDist} onChange={e => setOrdinaryDist(e.target.value)} 
                  />
               </div>
               <div>
                  <div className="flex justify-between items-baseline mb-1.5 px-1">
                    <label className="text-emerald-600 dark:text-emerald-400 font-black text-[10px] uppercase tracking-widest">{LABELS.asset.specialDist}</label>
                    <span className="text-[9px] text-[var(--text-muted)] font-bold">元本払戻</span>
                  </div>
                  <input 
                    type="number" step="1" 
                    placeholder="0"
                    className="flex h-12 w-full rounded-xl border border-emerald-600/20 bg-[var(--bg-card)] px-4 py-2 text-[var(--text-main)] font-mono font-black placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-emerald-500/30 transition-all" 
                    value={specialDist} onChange={e => setSpecialDist(e.target.value)} 
                  />
               </div>
            </div>
            <div>
              <label className="block text-[var(--text-muted)] font-black text-[10px] uppercase tracking-widest mb-1.5 ml-1">{LABELS.asset.tax}</label>
              <input 
                type="number" 
                placeholder="0"
                className="flex h-12 w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-2 text-[var(--text-main)] font-mono font-black placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-indigo-600/50 transition-all" 
                value={tax} onChange={e => setTax(e.target.value)} 
              />
            </div>
          </div>
        ) : (
          /* Standard UI */
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[var(--text-muted)] font-black text-[10px] uppercase tracking-widest mb-1.5 ml-1">{LABELS.asset.quantity} {selectedAsset?.unitLabel ? `(${selectedAsset.unitLabel})` : ''}</label>
              <input 
                type="number" step="0.0001" 
                placeholder="0.00"
                className="flex h-12 w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-2 text-[var(--text-main)] font-mono font-black placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-indigo-600/50 transition-all" 
                value={quantity} onChange={e => setQuantity(e.target.value)} 
              />
            </div>
            <div>
              <label className="block text-[var(--text-muted)] font-black text-[10px] uppercase tracking-widest mb-1.5 ml-1">{LABELS.asset.price}</label>
              <input 
                type="number" step="0.01" 
                placeholder="0.00"
                className="flex h-12 w-full rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-2 text-[var(--text-main)] font-mono font-black placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-indigo-600/50 transition-all" 
                value={price} onChange={e => setPrice(e.target.value)} 
              />
            </div>
          </div>
        )}

        {/* Validation Errors */}
        {Object.keys(formErrors).length > 0 && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 space-y-1">
            {Object.values(formErrors).map((msg, i) => (
              <p key={i} className="text-[11px] font-bold text-rose-500">{msg}</p>
            ))}
          </div>
        )}

        {/* Detailed Fields (Toggle) */}
        <div className="pt-2">
          {!showDetailed ? (
            <button 
              type="button" 
              onClick={() => setShowDetailed(true)}
              className="text-[10px] text-indigo-400 font-bold hover:text-indigo-300 transition-colors flex items-center gap-1 px-1"
            >
              ＋ 詳細入力を表示（手数料、メモ等）
            </button>
          ) : (
            <div className="space-y-4 animate-in fade-in-0 slide-in-from-top-1 duration-300">
              <div className="grid grid-cols-2 gap-4">
                {!isDistMode && (
                  <div>
                    <label className="block text-[var(--text-muted)] font-black text-[10px] uppercase tracking-widest mb-1.5 ml-1">{LABELS.asset.tax}</label>
                    <input 
                      type="number" 
                      className="flex h-11 w-full rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-2 text-[var(--text-main)] font-mono font-black focus:outline-none focus:ring-2 focus:ring-indigo-600/50 transition-all" 
                      value={tax} onChange={e => setTax(e.target.value)} 
                    />
                  </div>
                )}
                <div>
                  <label className="block text-[var(--text-muted)] font-black text-[10px] uppercase tracking-widest mb-1.5 ml-1">{LABELS.asset.fee}</label>
                  <input 
                    type="number" 
                    className="flex h-11 w-full rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-2 text-[var(--text-main)] font-mono font-black focus:outline-none focus:ring-2 focus:ring-indigo-600/50 transition-all" 
                    value={fee} onChange={e => setFee(e.target.value)} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[var(--text-muted)] font-black text-[10px] uppercase tracking-widest mb-1.5 ml-1">{LABELS.asset.note}</label>
                  <input 
                    type="text" 
                    className="flex h-11 w-full rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-2 text-[var(--text-main)] font-bold focus:outline-none focus:ring-2 focus:ring-indigo-600/50" 
                    value={note} onChange={e => setNote(e.target.value)} placeholder="取引の理由など" 
                  />
                </div>
                {(type !== 'adjustment' && type !== 'distribution') && (
                  <div>
                    <label className="block text-[var(--text-muted)] font-black text-[10px] uppercase tracking-widest mb-1.5 ml-1">{LABELS.asset.status}</label>
                    <select
                      className="flex h-11 w-full rounded-xl border border-[var(--border-main)] bg-[var(--bg-main)] px-4 py-2 text-sm text-[var(--text-main)] font-bold appearance-none cursor-pointer"
                      value={status} onChange={e => setStatus(e.target.value as TransactionStatus)}
                    >
                      <option value="planned" className="bg-[var(--bg-card)]">{LABELS.transaction.planned}</option>
                      <option value="confirmed" className="bg-[var(--bg-card)]">{LABELS.transaction.confirmed}</option>
                    </select>
                  </div>
                )}
              </div>
              
              <button 
                type="button" 
                onClick={() => setShowDetailed(false)}
                className="text-[10px] text-[var(--text-muted)] font-bold hover:text-[var(--text-main)] transition-colors px-1"
              >
                詳細入力を隠す
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-[var(--border-main)]/50">
          <button 
            type="button" onClick={onClose} 
            className="px-6 py-3 bg-[var(--bg-main)] text-[var(--text-muted)] font-black rounded-2xl hover:bg-black/10 dark:hover:bg-white/10 transition uppercase tracking-widest text-[10px] active:scale-95"
          >
            {LABELS.actions.cancel}
          </button>
          <button 
            type="submit" 
            className="px-8 py-3 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-700 transition shadow-xl shadow-indigo-600/30 uppercase tracking-[0.2em] text-[11px] active:scale-95"
          >
            {existingTransaction?.id ? LABELS.actions.saveChanges : LABELS.actions.register}
          </button>
        </div>
      </form>
    </div>
  );
};
