import {
  checkedAdd,
  hasSufficientGap,
} from "@/domain/nodes/nodeLayoutArithmetic";
import type { IndexedNodeForest } from "@/domain/nodes/nodeLayoutForest";
import type { LayoutPoint } from "@/domain/nodes/nodeLayoutPlacement";
import type { Node } from "@/types/node";

function isLayoutPinned(
  node: Node,
  pinnedById: ReadonlyMap<number, boolean> | null,
): boolean {
  if (pinnedById !== null) return pinnedById.get(node.id) === true;
  return node.layoutPinned === true;
}

export function hasValidVerticalSpacing(
  forest: IndexedNodeForest,
  positions: ReadonlyMap<number, LayoutPoint>,
  siblingGap: number,
  nodes?: readonly Node[],
): boolean {
  const pinnedById = nodes === undefined
    ? null
    : new Map(nodes.map((node) => [node.id, node.layoutPinned === true] as const));

  for (const level of forest.nodesByDepth) {
    let previous: (typeof level)[number] | null = null;
    for (const current of level) {
      const point = positions.get(current.id);
      if (!point || !Number.isFinite(point.y)) return false;
      if (previous !== null) {
        const skipPair = isLayoutPinned(previous, pinnedById)
          || isLayoutPinned(current, pinnedById);
        if (!skipPair) {
          const previousBottom = checkedAdd(positions.get(previous.id)!.y, previous.height);
          if (previousBottom === null) return false;
          if (!hasSufficientGap(
            previousBottom,
            point.y,
            siblingGap,
          )) return false;
        }
      }
      previous = current;
    }
  }
  return true;
}