export const NODE_KINDS = ["question", "conclusion", "evidence", "idea"] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

/** 左端色バーの幅（px）。glow なし */
export const NODE_KIND_BAR_WIDTH_PX = 4;

/** 左端色バー用 CSS 変数名（青 / 緑 / 橙 / 紫。glow なし） */
export const NODE_KIND_BAR_CSS_VARS = {
  question: "--node-kind-question",
  conclusion: "--node-kind-conclusion",
  evidence: "--node-kind-evidence",
  idea: "--node-kind-idea",
} as const satisfies Record<NodeKind, string>;

/**
 * Pixi / SVG 用のフォールバック色（`globals.css` の `--node-kind-*` 既定値と一致）。
 * Outline 等の DOM は `NODE_KIND_BAR_CSS_VARS` を参照する。
 */
export const NODE_KIND_BAR_FALLBACK_COLORS = {
  question: "#3b82f6",
  conclusion: "#22c55e",
  evidence: "#f97316",
  idea: "#a855f7",
} as const satisfies Record<NodeKind, string>;
