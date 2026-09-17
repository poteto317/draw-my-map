import { CHILD_HORIZONTAL_GAP, SIBLING_VERTICAL_GAP } from "@/config/shapes";
import {
  checkedAdd,
  checkedMultiply,
  checkedSubtract,
  hasSufficientGap,
} from "@/domain/nodes/nodeLayoutArithmetic";
import type { IndexedNodeForest } from "@/domain/nodes/nodeLayoutForest";

export type NodeLayoutMetrics = {
  columnX: readonly number[];
  spanById: ReadonlyMap<number, number>;
  childrenHeightById: ReadonlyMap<number, number>;
};

export function calculateNodeLayoutMetrics(
  forest: IndexedNodeForest,
): NodeLayoutMetrics | null {
  const maxWidthByDepth = forest.nodesByDepth.map((level) => {
    let maxWidth = 0;
    for (const node of level) maxWidth = Math.max(maxWidth, node.width);
    return maxWidth;
  });
  const columnX = [forest.roots[0].x];
  for (let depth = 1; depth < maxWidthByDepth.length; depth += 1) {
    const afterWidth = checkedAdd(columnX[depth - 1], maxWidthByDepth[depth - 1]);
    if (afterWidth === null) return null;
    const x = checkedAdd(afterWidth, CHILD_HORIZONTAL_GAP);
    if (x === null) return null;
    if (!hasSufficientGap(
      afterWidth,
      x,
      CHILD_HORIZONTAL_GAP,
    )) return null;
    columnX.push(x);
  }

  const spanById = new Map<number, number>();
  const childrenHeightById = new Map<number, number>();
  for (const current of forest.postOrder) {
    const children = forest.childrenByParent.get(current.id) ?? [];
    let childrenHeight = 0;
    for (const child of children) {
      const childSpan = spanById.get(child.id)!;
      const nextChildrenHeight = checkedAdd(childrenHeight, childSpan);
      if (nextChildrenHeight === null) return null;
      childrenHeight = nextChildrenHeight;
    }
    if (children.length > 1) {
      const gapCount = checkedSubtract(children.length, 1);
      if (gapCount === null) return null;
      const totalGap = checkedMultiply(SIBLING_VERTICAL_GAP, gapCount);
      if (totalGap === null) return null;
      const heightWithGaps = checkedAdd(childrenHeight, totalGap);
      if (heightWithGaps === null) return null;
      childrenHeight = heightWithGaps;
    }
    const span = Math.max(current.height, childrenHeight);
    if (!Number.isFinite(span)) return null;
    childrenHeightById.set(current.id, childrenHeight);
    spanById.set(current.id, span);
  }

  return { columnX, spanById, childrenHeightById };
}
