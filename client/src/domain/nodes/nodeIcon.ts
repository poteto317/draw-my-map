import type { Node } from "@/types/node";

/** キャンバス・アウトライン・書き出しでの icon 表示サイズ（約 16px） */
export const NODE_ICON_DISPLAY_SIZE_PX = 16;

/** ラベル左端と icon 中心のあいだのギャップ（px）。Pixi / SVG 共通 */
export const NODE_ICON_LABEL_GAP = 4;

/**
 * ラベル中心と折り返し幅から icon の中心 X を返す（純粋計算）。
 * Pixi Text / SVG text の両方が同じ配置規則に従う。
 */
export function getNodeIconCenterX(labelCenterX: number, labelLayoutWidth: number): number {
  return (
    labelCenterX
    - labelLayoutWidth / 2
    - NODE_ICON_LABEL_GAP
    - NODE_ICON_DISPLAY_SIZE_PX / 2
  );
}

const graphemeSegmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter("ja", { granularity: "grapheme" })
    : null;

const EXTENDED_PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const MAX_ICON_CODE_POINTS = 16;

export function isAcceptableNodeIcon(value: string): boolean {
  if (graphemeSegmenter === null) {
    // Segmenter 非対応環境では絵文字1文字相当のみ緩く受理しない（文書を壊さない）
    return false;
  }
  const segments = [...graphemeSegmenter.segment(value)];
  if (segments.length !== 1) return false;
  const grapheme = segments[0]!.segment;
  const codePoints = [...grapheme];
  if (codePoints.length < 1 || codePoints.length > MAX_ICON_CODE_POINTS) return false;
  return EXTENDED_PICTOGRAPHIC.test(grapheme);
}

export function normalizeNodeIcon(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return isAcceptableNodeIcon(value) ? value : undefined;
}

/** 正本。受理条件外・欠落はキー省略 */
export function projectNodeIcon(node: Pick<Node, "icon">): { icon?: string } {
  const icon = normalizeNodeIcon(node.icon);
  return icon === undefined ? {} : { icon };
}

/** 既存の icon キーを外して投影結果を載せる（更新・統合の共通経路） */
export function applyProjectedNodeIcon(node: Node, icon: string | undefined): Node {
  const projected = projectNodeIcon({ icon });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 分割代入で icon を除外するため
  const { icon: _icon, ...rest } = node;
  return { ...rest, ...projected };
}

export type ResolveNodeIconDraftResult =
  | { ok: true; icon: string | undefined }
  | { ok: false };

/**
 * 見た目 UI の下書き文字列を受理結果へ写す（純粋）。
 * 空はクリア、受理不可は失敗。副作用（state / コールバック）は呼び出し側。
 */
export function resolveNodeIconDraft(draft: string): ResolveNodeIconDraftResult {
  const trimmed = draft.trim();
  if (trimmed === "") return { ok: true, icon: undefined };
  if (!isAcceptableNodeIcon(trimmed)) return { ok: false };
  return { ok: true, icon: trimmed };
}
