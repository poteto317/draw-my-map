import {
  CHILD_HORIZONTAL_GAP,
  SIBLING_VERTICAL_GAP,
  TREE_VERTICAL_GAP,
} from "@/config/shapes";
import type { IndexedNodeForest } from "@/domain/nodes/nodeLayoutForest";

export type LayoutPoint = { x: number; y: number };

function checkedAdd(left: number, right: number): number | null {
  const result = left + right;
  if (!Number.isFinite(result)) return null;
  if (right > 0 && result <= left) return null;
  if (right < 0 && result >= left) return null;
  return result;
}

function checkedSubtract(left: number, right: number): number | null {
  const result = left - right;
  if (!Number.isFinite(result)) return null;
  if (right > 0 && result >= left) return null;
  if (right < 0 && result <= left) return null;
  return result;
}

function checkedMultiply(left: number, right: number): number | null {
  const result = left * right;
  return Number.isFinite(result) ? result : null;
}

export function calculateNodePositions(
  forest: IndexedNodeForest,
): ReadonlyMap<number, LayoutPoint> | null {
  if (forest.nodes.length === 0) return new Map();
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
    columnX.push(x);
  }

  const spans = new Map<number, number>();
  const childrenHeights = new Map<number, number>();
  for (const current of forest.postOrder) {
    const children = forest.childrenByParent.get(current.id) ?? [];
    let childrenHeight = 0;
    for (const child of children) {
      const childSpan = spans.get(child.id)!;
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
    childrenHeights.set(current.id, childrenHeight);
    spans.set(current.id, span);
  }

  const positions = new Map<number, LayoutPoint>();
  let nextTreeTop: number | null = null;
  for (const [rootIndex, root] of forest.roots.entries()) {
    const rootSpan = spans.get(root.id)!;
    const rootExtraSpan = checkedSubtract(rootSpan, root.height);
    if (rootExtraSpan === null) return null;
    const rootTopOffset = checkedMultiply(rootExtraSpan, 0.5);
    if (rootTopOffset === null) return null;
    const top = rootIndex === 0
      ? checkedSubtract(root.y, rootTopOffset)
      : nextTreeTop!;
    if (top === null) return null;
    const stack = [{ node: root, top }];
    while (stack.length > 0) {
      const frame = stack.pop()!;
      const depth = forest.depthById.get(frame.node.id)!;
      const span = spans.get(frame.node.id)!;
      const extraSpan = checkedSubtract(span, frame.node.height);
      if (extraSpan === null) return null;
      const yOffset = checkedMultiply(extraSpan, 0.5);
      if (yOffset === null) return null;
      const y = checkedAdd(frame.top, yOffset);
      if (y === null) return null;
      positions.set(frame.node.id, {
        x: columnX[depth],
        y: rootIndex === 0 && frame.node === root ? root.y : y,
      });

      const children = forest.childrenByParent.get(frame.node.id) ?? [];
      const childFrames: Array<{ node: (typeof children)[number]; top: number }> = [];
      const extraChildSpan = checkedSubtract(span, childrenHeights.get(frame.node.id)!);
      if (extraChildSpan === null) return null;
      const childTopOffset = checkedMultiply(extraChildSpan, 0.5);
      if (childTopOffset === null) return null;
      let childTop = checkedAdd(frame.top, childTopOffset);
      if (childTop === null) return null;
      for (const child of children) {
        childFrames.push({ node: child, top: childTop });
        const afterChild = checkedAdd(childTop, spans.get(child.id)!);
        if (afterChild === null) return null;
        childTop = checkedAdd(afterChild, SIBLING_VERTICAL_GAP);
        if (childTop === null) return null;
      }
      for (let index = childFrames.length - 1; index >= 0; index -= 1) {
        stack.push(childFrames[index]);
      }
    }
    const rootBottom = checkedAdd(top, rootSpan);
    if (rootBottom === null) return null;
    nextTreeTop = checkedAdd(rootBottom, TREE_VERTICAL_GAP);
    if (nextTreeTop === null) return null;
  }

  for (const level of forest.nodesByDepth) {
    let previousBottom: number | null = null;
    for (const current of level) {
      const point = positions.get(current.id)!;
      if (previousBottom !== null) {
        const minimumTop = checkedAdd(previousBottom, SIBLING_VERTICAL_GAP);
        if (minimumTop === null || point.y < minimumTop) return null;
      }
      previousBottom = checkedAdd(point.y, current.height);
      if (previousBottom === null) return null;
    }
  }
  return positions;
}
