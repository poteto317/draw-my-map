import {
  isPinnedLayoutEditEnabled,
  isPinnedNodeDragBlocked,
  type LayoutPinnedGuardInput,
} from "@/domain/map/mapLayoutPinnedAvailability";
import type { Node } from "@/types/node";

export type PinnedNodeDragCallbacksInput = LayoutPinnedGuardInput & {
  layoutMode: "auto" | "manual";
  nodes: readonly Node[];
  movePinnedNode: (id: number, x: number, y: number) => boolean;
  finalizePinnedNodeMove: () => boolean;
};

export type PinnedNodeDragCallbacks = {
  onMovePinnedNode?: (id: number, x: number, y: number) => void;
  onFinalizePinnedNodeMove?: () => boolean;
};

/**
 * MapEditor → stage の N6 配線。
 * document ゲートでコールバックを付け外しし、移動時は isPinnedNodeDragBlocked で拒否する。
 */
export function resolvePinnedNodeDragCallbacks(
  input: PinnedNodeDragCallbacksInput,
): PinnedNodeDragCallbacks {
  if (!isPinnedLayoutEditEnabled(input)) {
    return {};
  }
  const { layoutMode, nodes, movePinnedNode, finalizePinnedNodeMove } = input;
  return {
    onMovePinnedNode: (id, x, y) => {
      const node = nodes.find((candidate) => candidate.id === id);
      if (isPinnedNodeDragBlocked({ ...input, layoutMode, node })) return;
      movePinnedNode(id, x, y);
    },
    onFinalizePinnedNodeMove: finalizePinnedNodeMove,
  };
}
