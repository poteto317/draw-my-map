import { SIBLING_VERTICAL_GAP } from "@/config/shapes";
import {
  checkedAdd,
  hasSufficientGap,
} from "@/domain/nodes/nodeLayoutArithmetic";
import type { IndexedNodeForest } from "@/domain/nodes/nodeLayoutForest";
import type { LayoutPoint } from "@/domain/nodes/nodeLayoutPlacement";

export function hasValidVerticalSpacing(
  forest: IndexedNodeForest,
  positions: ReadonlyMap<number, LayoutPoint>,
): boolean {
  for (const level of forest.nodesByDepth) {
    let previous: (typeof level)[number] | null = null;
    for (const current of level) {
      const point = positions.get(current.id);
      if (!point || !Number.isFinite(point.y)) return false;
      if (previous !== null) {
        const previousBottom = checkedAdd(positions.get(previous.id)!.y, previous.height);
        if (previousBottom === null) return false;
        if (!hasSufficientGap(
          previousBottom,
          point.y,
          SIBLING_VERTICAL_GAP,
        )) return false;
      }
      previous = current;
    }
  }
  return true;
}
