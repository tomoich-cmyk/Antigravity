export const ENVIRONMENT_LABEL_MAP = {
  tailwind: "追い風",
  slightly_tailwind: "やや追い風",
  neutral: "中立",
  slightly_headwind: "やや逆風",
  headwind: "逆風",
} as const;

export const DECISION_LABEL_MAP = {
  strong_buy_candidate: "買付候補",
  buy_candidate: "買付候補",
  sell_candidate: "売却候補",
  watch: "様子見",
  hold: "ホールド継続",
  pending: "保留",
  sell_priority: "売却優先",
  avoid: "回避",
  sell_approaching: "売却接近",
  front_run_candidate: "買付候補",
} as const;

export const SOURCE_LABEL_MAP = {
  api: "同期済",
  manual: "手動",
  preview: "確認前",
  stale: "古い値",
} as const;

export const PRICE_KIND_LABEL_MAP = {
  market: "現在値",
  official: "基準価額",
  reference: "参考価格",
} as const;
