import {
  checkedAdd,
  checkedSubtract,
  hasSufficientGap,
} from "@/domain/nodes/nodeLayoutArithmetic";
import type { IndexedNodeForest } from "@/domain/nodes/nodeLayoutForest";
import type { NodeLayoutMetrics } from "@/domain/nodes/nodeLayoutMetrics";
import { placePinnedAwareForest } from "@/domain/nodes/nodeLayoutPinnedAwarePlacement";
import {
  calculateCenteringOffset,
  calculateChildFrames,
  isLayoutPinned,
  type LayoutPoint,
} from "@/domain/nodes/nodeLayoutPlacementShared";
import type { LayoutGapMetrics } from "@/domain/nodes/resolveLayoutMetrics";

export type { LayoutPoint } from "@/domain/nodes/nodeLayoutPlacementShared";

function forestHasPins(forest: IndexedNodeForest): boolean {
  return forest.nodes.some(isLayoutPinned);
}

function placeUnpinnedForest(
  forest: IndexedNodeForest,
  metrics: NodeLayoutMetrics,
  siblingGap: number,
): ReadonlyMap<number, LayoutPoint> | null {
  const { columnX, spanById, childrenHeightById } = metrics;
  const treeGap = siblingGap * 2;
  const positions = new Map<number, LayoutPoint>();
  let nextTreeTop: number | null = null;
  for (const [rootIndex, root] of forest.roots.entries()) {
    const hasNextRoot = rootIndex + 1 < forest.roots.length;
    let actualTreeBottom = -Infinity;
    const rootSpan = spanById.get(root.id)!;
    const rootTopOffset = calculateCenteringOffset(rootSpan, root.height);
    if (rootTopOffset === null) return null;
    const top = rootIndex === 0
      ? checkedSubtract(root.y, rootTopOffset)
      : nextTreeTop!;
    if (top === null) return null;
    const stack = [{ node: root, top }];
    while (stack.length > 0) {
      const frame = stack.pop()!;
      const depth = forest.depthById.get(frame.node.id)!;
      const span = spanById.get(frame.node.id)!;
      const yOffset = calculateCenteringOffset(span, frame.node.height);
      if (yOffset === null) return null;
      const y = checkedAdd(frame.top, yOffset);
      if (y === null) return null;
      const actualY = rootIndex === 0 && frame.node === root ? root.y : y;
      positions.set(frame.node.id, {
        x: columnX[depth],
        y: actualY,
      });
      if (hasNextRoot) {
        const bottom = checkedAdd(actualY, frame.node.height);
        if (bottom === null) return null;
        actualTreeBottom = Math.max(actualTreeBottom, bottom);
      }

      const children = forest.childrenByParent.get(frame.node.id) ?? [];
      if (children.length === 0) continue;
      const childFrames = calculateChildFrames(
        children,
        frame.top,
        span,
        childrenHeightById.get(frame.node.id)!,
        spanById,
        siblingGap,
      );
      if (childFrames === null) return null;
      for (let index = childFrames.length - 1; index >= 0; index -= 1) {
        stack.push(childFrames[index]);
      }
    }
    if (hasNextRoot) {
      nextTreeTop = checkedAdd(actualTreeBottom, treeGap);
      if (nextTreeTop === null) return null;
      if (!hasSufficientGap(
        actualTreeBottom,
        nextTreeTop,
        treeGap,
      )) return null;
    }
  }
  return positions;
}

export function placeNodeForest(
  forest: IndexedNodeForest,
  metrics: NodeLayoutMetrics,
  { siblingGap }: LayoutGapMetrics,
): ReadonlyMap<number, LayoutPoint> | null {
  if (!forestHasPins(forest)) {
    return placeUnpinnedForest(forest, metrics, siblingGap);
  }
  return placePinnedAwareForest(forest, metrics, siblingGap);
}
