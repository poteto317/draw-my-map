import { SIBLING_VERTICAL_GAP, TREE_VERTICAL_GAP } from "@/config/shapes";
import {
  checkedAdd,
  checkedMultiply,
  checkedSubtract,
  hasSufficientGap,
} from "@/domain/nodes/nodeLayoutArithmetic";
import type { IndexedNodeForest } from "@/domain/nodes/nodeLayoutForest";
import type { NodeLayoutMetrics } from "@/domain/nodes/nodeLayoutMetrics";
import type { Node } from "@/types/node";

export type LayoutPoint = { x: number; y: number };
type ChildFrame = { node: Node; top: number };

function calculateCenteringOffset(outerSpan: number, innerHeight: number): number | null {
  const extraSpan = checkedSubtract(outerSpan, innerHeight);
  if (extraSpan === null) return null;
  return checkedMultiply(extraSpan, 0.5);
}

function calculateChildFrames(
  children: readonly Node[],
  frameTop: number,
  span: number,
  childrenHeight: number,
  spanById: ReadonlyMap<number, number>,
): ChildFrame[] | null {
  const childFrames: ChildFrame[] = [];
  const childTopOffset = calculateCenteringOffset(span, childrenHeight);
  if (childTopOffset === null) return null;
  let childTop = checkedAdd(frameTop, childTopOffset);
  if (childTop === null) return null;
  for (const [childIndex, child] of children.entries()) {
    childFrames.push({ node: child, top: childTop });
    if (childIndex + 1 < children.length) {
      const afterChild = checkedAdd(childTop, spanById.get(child.id)!);
      if (afterChild === null) return null;
      childTop = checkedAdd(afterChild, SIBLING_VERTICAL_GAP);
      if (childTop === null) return null;
    }
  }
  return childFrames;
}

export function placeNodeForest(
  forest: IndexedNodeForest,
  metrics: NodeLayoutMetrics,
): ReadonlyMap<number, LayoutPoint> | null {
  const { columnX, spanById, childrenHeightById } = metrics;
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
      );
      if (childFrames === null) return null;
      for (let index = childFrames.length - 1; index >= 0; index -= 1) {
        stack.push(childFrames[index]);
      }
    }
    if (hasNextRoot) {
      nextTreeTop = checkedAdd(actualTreeBottom, TREE_VERTICAL_GAP);
      if (nextTreeTop === null) return null;
      if (!hasSufficientGap(
        actualTreeBottom,
        nextTreeTop,
        TREE_VERTICAL_GAP,
      )) return null;
    }
  }
  return positions;
}
