import { collectSubtreeIds } from "@/domain/nodes/nodeTree";
import type { Node } from "@/types/node";

export type HighlightMode = "off" | "search" | "selection";

/** 強調モード有効時、非強調かつ論理可視の contentAlpha */
export const HIGHLIGHT_DIM_ALPHA = 0.25;

/**
 * 一時強調の対象 ID 集合。
 * - off: 空
 * - search: searchHitIds ∩ visibleNodeIds
 * - selection: 選択各 ID の部分木の和（選択 0 件は空 → 全ノード通常 alpha）
 */
export function collectHighlightNodeIds(
  mode: HighlightMode,
  searchHitIds: ReadonlySet<number>,
  selectedIds: ReadonlySet<number>,
  nodes: readonly Node[],
  visibleNodeIds: ReadonlySet<number>,
): ReadonlySet<number> {
  if (mode === "off") return new Set();

  if (mode === "search") {
    const highlighted = new Set<number>();
    for (const id of searchHitIds) {
      if (visibleNodeIds.has(id)) highlighted.add(id);
    }
    return highlighted;
  }

  if (selectedIds.size === 0) return new Set();

  const highlighted = new Set<number>();
  for (const id of selectedIds) {
    for (const subtreeId of collectSubtreeIds(nodes, id)) {
      highlighted.add(subtreeId);
    }
  }
  return highlighted;
}
