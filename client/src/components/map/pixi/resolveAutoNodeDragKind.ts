import type { Node } from "@/types/node";

export type AutoNodeDragKind =
  | { kind: "pinned-move" }
  | { kind: "sibling-reorder" }
  | { kind: "noop" };

/**
 * auto モード中のノード pointer ドラッグ方針（純判定）。
 * ピンかつコールバック欠落は noop（並べ替えへ落とさない）。
 */
export function resolveAutoNodeDragKind(
  target: Node | undefined,
  hasPinnedMoveCallbacks: boolean,
): AutoNodeDragKind {
  if (target?.layoutPinned === true) {
    return hasPinnedMoveCallbacks ? { kind: "pinned-move" } : { kind: "noop" };
  }
  return { kind: "sibling-reorder" };
}
