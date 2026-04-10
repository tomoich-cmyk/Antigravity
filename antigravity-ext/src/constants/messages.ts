export const MESSAGES = {
  updatedWithinHour: () => "更新: 1時間以内",
  updatedHoursAgo: (hours: number) => `更新: ${hours}時間前`,
  updatedDaysAgo: (days: number) => `更新: ${days}日前`,
  notUpdated: () => "更新: 未取得",

  scoreWithLabel: (label: string, score: number) => `${label}（${score}pt）`,

  decisionBand: (lower: number, upper: number) =>
    `${lower.toLocaleString()}〜${upper.toLocaleString()}円`,

  baseSellPrice: (price: number) => `売 ${price.toLocaleString()}円`,
  baseBuyPrice: (price: number) => `買 ${price.toLocaleString()}円`,

  diffToSell: (diff: number) => `売まであと${diff.toLocaleString()}円`,
  diffToBuy: (diff: number) => `買まであと${diff.toLocaleString()}円`,

  // 閾値を超過している場合 (price >= sell threshold / price <= buy threshold)
  diffSellExceeded: (diff: number) => `売ライン超過 +${diff.toLocaleString()}円`,
  diffBuyExceeded: (diff: number) => `買ライン超過 -${diff.toLocaleString()}円`,

  diffGeneric: (diff: number) => `あと${diff.toLocaleString()}円`,

  stockBatchSuccess: (mode: string, count: number) => 
    `${mode === 'midday' ? '前場' : '大引け'}の価格${count}件を保存し、判定を更新しました。`,
  noInputError: () => "入力された価格がありません",
  officialPriceSaveSuccess: () => "公式基準価額を保存しました",
  referencePriceApplySuccess: () => "参考価格を適用しました",
  marketSaveSuccess: () => "市況情報を保存しました",
  syncFetchSuccess: (stocks: number, indices: number) => 
    `同期データを取得しました (個別株:${stocks}件, 市況:${indices}件)`,
  syncComplete: () => "全ての同期データを保存し、判定を更新しました",
  saveError: () => "保存中にエラーが発生しました",

  reasonSellNotReached: () => "売切基準未達",
  reasonSellReached: () => "基準売却価格に到達",
  reasonSellApproaching: () => "基準売却価格に接近",
  reasonBuyNotReached: () => "買付基準未達",
  reasonBuyReached: () => "基準買付価格に到達",
  reasonBuyApproaching: () => "基準買付価格に接近",
  reasonHoldByTailwind: () => "追い風のため様子見",
  reasonHoldByHeadwind: () => "逆風のため保留",

  syncSummary: (indices: number, stocks: number, failed: number) =>
    `市況 ${indices}件更新 / 株価 ${stocks}件反映 / 失敗 ${failed}件`,
};

export const REASON_MESSAGES = {
  buy: {
    reached: "買付ライン到達",
    reachedTailwind: "追い風。本命の買付圏内",
    heldByHeadwind: "価格は到達したが逆風のため様子見",
    frontRun: (price: number) => `追い風につき ${price.toLocaleString()}円 まで前倒し検討`,
    watchClose: "買付ラインに近いが、まだ様子見",
    noEarlyBuy: "逆風。早めの買いは厳禁",
    deepValue: "大幅な割安圏内",
    outOfRange: "買付基準未達",
  },
  sell: {
    reached: "売却ライン到達",
    reachedHeadwind: "逆風。利益確保を優先",
    heldByTailwind: "追い風。さらなる伸びを期待",
    approachingHeadwind: (price: number) => `逆風につき ${price.toLocaleString()}円 まで売却候補を拡大`,
    watchClose: "売却ラインに近いが、まだ様子見",
    noEarlySell: "追い風. 売り急ぐ必要なし",
    strongTailwind: "強い追い風。ホールド継続",
    outOfRange: "売却基準未達",
  },
} as const;
