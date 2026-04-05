import React from 'react';
import type { AssetCardViewModel } from '../types/viewModels';
import type { FreshnessLevel } from '../types/market';
import {
  formatYen,
  formatSignedYen,
  formatSyncedAtLabel,
  PRICE_KIND_LABEL,
} from '../lib/priceHelpers';
import { LABELS } from '../constants/labels';

interface Props {
  vm: AssetCardViewModel;
}

export const AssetCard: React.FC<Props> = ({ vm }) => {
  const fv = vm.priceMeta.freshnessView;

  // 価格ラベル: canPretendCurrent → "現在値", それ以外は priceKind ベース
  const priceTypeLabel = fv?.canPretendCurrent
    ? '現在値'
    : PRICE_KIND_LABEL[vm.priceMeta.priceKind];

  // メタ情報行: asOfLabel (鮮度エンジン由来) + 更新時刻
  const asOfLine    = fv?.asOfLabel;
  const syncedLine  = formatSyncedAtLabel(vm.priceMeta.syncedAt);

  return (
    <section className="flex flex-col bg-[var(--bg-card)] border border-[var(--border-main)] rounded-3xl shadow-sm hover:shadow-md transition-all overflow-hidden h-full">
      {/* ブロックA：ヘッダー */}
      <div className="px-4 pt-4 pb-3 border-b border-[var(--border-main)] bg-[var(--bg-main)]/30">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-[13px] font-black tracking-tight text-[var(--text-main)] truncate flex items-center gap-2" title={vm.name}>
              {vm.name}
              <span className="text-[8px] px-1.5 py-0.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 rounded uppercase tracking-widest font-bold shrink-0">
                {vm.assetClass === 'fund' ? 'MF' : 'EQ'}
              </span>
            </h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[8px] font-bold">
              {asOfLine && (
                <span className="text-[var(--text-muted)] opacity-70">{asOfLine}</span>
              )}
              <span className="text-[var(--text-muted)] opacity-70">{syncedLine}</span>
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="flex items-center justify-end gap-1 mb-1 h-3">
              <FreshnessBadge level={fv?.level} />
            </div>
            <div className="text-[16px] font-black tracking-tighter text-[var(--text-main)] leading-none mb-1">
              {formatYen(vm.displayPrice)}
            </div>
            <div className="text-[8px] font-black text-indigo-500/80 uppercase tracking-widest">{priceTypeLabel}</div>
          </div>
        </div>
      </div>

      {/* ブロックB：判定 */}
      <div className="px-4 py-3 border-b border-[var(--border-main)] flex-grow">
        <div className="flex flex-wrap gap-2 mb-3">
          <div className={`rounded-xl px-3 py-1 text-[10px] font-black shadow-sm flex items-center gap-1.5 ${vm.decisionColor}`}>
            <span>{vm.decisionIcon}</span>
            <span>{vm.decisionLabel}</span>
          </div>

          {vm.environmentLabel && (
            <div className="rounded-xl bg-[var(--bg-main)] border border-[var(--border-main)] px-2 py-1 text-[9px] font-bold text-[var(--text-muted)]">
              {vm.environmentLabel}
              {typeof vm.environmentScore === "number" ? ` (${vm.environmentScore}pt)` : ""}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <InfoBox title={LABELS.asset.decisionBand} value={vm.decisionBandText ?? "—"} />
          <InfoBox title={LABELS.asset.reason} value={vm.reasonText ?? "—"} />
        </div>
      </div>

      {/* ブロックC：保有情報 */}
      <div className="px-4 py-3 bg-[var(--bg-main)]/20 grid grid-cols-2 gap-x-4 gap-y-2">
        <Kv label={LABELS.asset.holdingQty} value={vm.quantity != null ? `${vm.quantity.toLocaleString()}${vm.unitLabel}` : "—"} />
        <Kv label={LABELS.asset.averageCost} value={formatYen(vm.averageCost)} align="right" />
        <Kv label={LABELS.asset.valuation} value={formatYen(vm.marketValue)} valueClassName="text-indigo-600 dark:text-indigo-400" />
        <Kv
          label={LABELS.asset.unrealizedPnL}
          value={formatSignedYen(vm.unrealizedPnL)}
          align="right"
          valueClassName={
            (vm.unrealizedPnL ?? 0) > 0
              ? "text-emerald-600"
              : (vm.unrealizedPnL ?? 0) < 0
              ? "text-rose-500"
              : "text-[var(--text-main)]"
          }
        />
      </div>

      {/* Footer: 基準価格 + 差 */}
      <div className="px-4 py-3 border-t border-[var(--border-main)] flex items-end justify-between gap-2">
        <Kv label={LABELS.trigger.basePrice} value={vm.basePriceText ?? "—"} />
        <Kv label={LABELS.asset.difference} value={vm.diffText ?? "—"} align="right" valueClassName={vm.diffColor} />
      </div>
    </section>
  );
}

// ─── 鮮度バッジ ───────────────────────────────────────────────────────────────
const FreshnessBadge: React.FC<{ level?: FreshnessLevel }> = ({ level }) => {
  if (!level || level === 'fresh') return null;
  if (level === 'stale') {
    return (
      <span className="text-[7px] font-black px-1 py-0.5 bg-amber-500 text-white rounded-[4px] uppercase tracking-tighter animate-pulse">
        STALE
      </span>
    );
  }
  if (level === 'lagging') {
    return (
      <span className="text-[7px] font-black px-1 py-0.5 bg-yellow-400 text-slate-900 rounded-[4px] uppercase tracking-tighter">
        LAGGING
      </span>
    );
  }
  // unknown
  return (
    <span className="text-[7px] font-black px-1 py-0.5 bg-slate-400 text-white rounded-[4px] uppercase tracking-tighter">
      ?
    </span>
  );
};

const InfoBox: React.FC<{ title: string; value: string }> = ({ title, value }) => {
  return (
    <div className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-main)]/50 p-2 overflow-hidden">
      <div className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-1">{title}</div>
      <div className="text-[9px] font-bold tracking-tight text-[var(--text-main)] leading-tight line-clamp-2">{value}</div>
    </div>
  );
}

const Kv: React.FC<{
  label: string;
  value: string;
  align?: "left" | "right";
  valueClassName?: string;
}> = ({
  label,
  value,
  align = "left",
  valueClassName,
}) => {
  return (
    <div className={align === "right" ? "text-right" : "text-left"}>
      <div className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-0.5">{label}</div>
      <div className={`text-[10px] font-black tracking-tight ${valueClassName ?? "text-[var(--text-main)]"}`}>
        {value}
      </div>
    </div>
  );
}
