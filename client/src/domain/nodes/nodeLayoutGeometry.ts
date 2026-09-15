import {
  CHILD_HORIZONTAL_GAP,
  SIBLING_VERTICAL_GAP,
  TREE_VERTICAL_GAP,
} from "@/config/shapes";
import type { IndexedNodeForest } from "@/domain/nodes/nodeLayoutForest";

export type LayoutPoint = { x: number; y: number };

function finite(value: number): number | null {
  return Number.isFinite(value) ? value : null;
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
    const x = finite(columnX[depth - 1] + maxWidthByDepth[depth - 1] + CHILD_HORIZONTAL_GAP);
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
      childrenHeight = childrenHeight + childSpan;
      if (!Number.isFinite(childrenHeight)) return null;
    }
    if (children.length > 1) {
      childrenHeight += SIBLING_VERTICAL_GAP * (children.length - 1);
    }
    const span = Math.max(current.height, childrenHeight);
    if (!Number.isFinite(childrenHeight) || !Number.isFinite(span)) return null;
    childrenHeights.set(current.id, childrenHeight);
    spans.set(current.id, span);
  }

  const positions = new Map<number, LayoutPoint>();
  let nextTreeTop: number | null = null;
  for (const [rootIndex, root] of forest.roots.entries()) {
    const rootSpan = spans.get(root.id)!;
    const top = rootIndex === 0
      ? root.y - (rootSpan - root.height) / 2
      : nextTreeTop!;
    if (!Number.isFinite(top)) return null;
    const stack = [{ node: root, top }];
    while (stack.length > 0) {
      const frame = stack.pop()!;
      const depth = forest.depthById.get(frame.node.id)!;
      const span = spans.get(frame.node.id)!;
      const y = frame.top + (span - frame.node.height) / 2;
      if (!Number.isFinite(y)) return null;
      positions.set(frame.node.id, { x: columnX[depth], y });

      const children = forest.childrenByParent.get(frame.node.id) ?? [];
      const childFrames: Array<{ node: (typeof children)[number]; top: number }> = [];
      let childTop = frame.top + (span - childrenHeights.get(frame.node.id)!) / 2;
      for (const child of children) {
        childFrames.push({ node: child, top: childTop });
        childTop += spans.get(child.id)! + SIBLING_VERTICAL_GAP;
        if (!Number.isFinite(childTop)) return null;
      }
      for (let index = childFrames.length - 1; index >= 0; index -= 1) {
        stack.push(childFrames[index]);
      }
    }
    nextTreeTop = top + rootSpan + TREE_VERTICAL_GAP;
    if (!Number.isFinite(nextTreeTop)) return null;
  }

  for (const level of forest.nodesByDepth) {
    let previousBottom: number | null = null;
    for (const current of level) {
      const point = positions.get(current.id)!;
      if (previousBottom !== null && point.y < previousBottom + SIBLING_VERTICAL_GAP) return null;
      previousBottom = point.y + current.height;
      if (!Number.isFinite(previousBottom)) return null;
    }
  }
  return positions;
}
