import {
  checkedAdd,
  checkedSubtract,
  hasSufficientGap,
} from "@/domain/nodes/nodeLayoutArithmetic";
import type { IndexedNodeForest } from "@/domain/nodes/nodeLayoutForest";
import type { NodeLayoutMetrics } from "@/domain/nodes/nodeLayoutMetrics";
import {
  calculateCenteringOffset,
  calculateChildFrames,
  extentFromPosition,
  isLayoutPinned,
  mergeSubtreeExtent,
  type LayoutPoint,
  type SubtreeExtent,
} from "@/domain/nodes/nodeLayoutPlacementShared";
import type { Node } from "@/types/node";

function runSpanHeight(
  run: readonly Node[],
  spanById: ReadonlyMap<number, number>,
  siblingGap: number,
): number | null {
  if (run.length === 0) return 0;
  let height = 0;
  for (const [index, node] of run.entries()) {
    const next = checkedAdd(height, spanById.get(node.id)!);
    if (next === null) return null;
    height = next;
    if (index + 1 < run.length) {
      const withGap = checkedAdd(height, siblingGap);
      if (withGap === null) return null;
      height = withGap;
    }
  }
  return height;
}

function packRunTops(
  run: readonly Node[],
  spanById: ReadonlyMap<number, number>,
  siblingGap: number,
  startTop: number,
): Map<number, number> | null {
  const tops = new Map<number, number>();
  let top = startTop;
  for (const [index, node] of run.entries()) {
    tops.set(node.id, top);
    if (index + 1 < run.length) {
      const after = checkedAdd(top, spanById.get(node.id)!);
      if (after === null) return null;
      const next = checkedAdd(after, siblingGap);
      if (next === null) return null;
      top = next;
    }
  }
  return tops;
}

function placePinnedSubtree(
  forest: IndexedNodeForest,
  metrics: NodeLayoutMetrics,
  siblingGap: number,
  pinned: Node,
  positions: Map<number, LayoutPoint>,
): SubtreeExtent | null {
  positions.set(pinned.id, { x: pinned.x, y: pinned.y });
  const extent = extentFromPosition(pinned, { x: pinned.x, y: pinned.y });
  if (extent === null) return null;

  const children = forest.childrenByParent.get(pinned.id) ?? [];
  if (children.length === 0) return extent;

  const childExtent = placeChildSequence(
    forest,
    metrics,
    siblingGap,
    children,
    {
      kind: "pin-anchor",
      pin: pinned,
    },
    positions,
  );
  if (childExtent === null) return null;
  return mergeSubtreeExtent(extent, childExtent);
}

type ChildPackContext =
  | { kind: "pin-anchor"; pin: Node }
  | { kind: "free-top"; frameTop: number; span: number; childrenHeight: number };

function placeChildSequence(
  forest: IndexedNodeForest,
  metrics: NodeLayoutMetrics,
  siblingGap: number,
  children: readonly Node[],
  context: ChildPackContext,
  positions: Map<number, LayoutPoint>,
): SubtreeExtent | null {
  if (children.length === 0) return null;

  if (!children.some(isLayoutPinned)) {
    return placeUnpinnedChildSequence(
      forest,
      metrics,
      siblingGap,
      children,
      context,
      positions,
    );
  }

  return placeMixedChildSequence(
    forest,
    metrics,
    siblingGap,
    children,
    positions,
  );
}

function placeUnpinnedChildSequence(
  forest: IndexedNodeForest,
  metrics: NodeLayoutMetrics,
  siblingGap: number,
  children: readonly Node[],
  context: ChildPackContext,
  positions: Map<number, LayoutPoint>,
): SubtreeExtent | null {
  const { spanById, childrenHeightById } = metrics;
  let frameTop: number;
  let span: number;
  let childrenHeight: number;

  if (context.kind === "pin-anchor") {
    childrenHeight = childrenHeightById.get(context.pin.id) ?? (() => {
      let height = 0;
      for (const [index, child] of children.entries()) {
        height += spanById.get(child.id)!;
        if (index + 1 < children.length) height += siblingGap;
      }
      return height;
    })();
    // ピン中心に子グループを合わせる。calculateChildFrames の再センタリングを避けるため
    // span === childrenHeight で渡し、frameTop をそのまま先頭にする
    span = childrenHeight;
    frameTop = context.pin.y + context.pin.height / 2 - childrenHeight / 2;
    if (!Number.isFinite(frameTop)) return null;
  } else {
    frameTop = context.frameTop;
    span = context.span;
    childrenHeight = context.childrenHeight;
  }

  const childFrames = calculateChildFrames(
    children,
    frameTop,
    span,
    childrenHeight,
    spanById,
    siblingGap,
  );
  if (childFrames === null) return null;

  let extent: SubtreeExtent | null = null;
  for (const childFrame of childFrames) {
    const placed = placeNodeAtTop(
      forest,
      metrics,
      siblingGap,
      childFrame.node,
      childFrame.top,
      positions,
    );
    if (placed === null) return null;
    extent = mergeSubtreeExtent(extent, placed);
  }
  return extent;
}

function placeMixedChildSequence(
  forest: IndexedNodeForest,
  metrics: NodeLayoutMetrics,
  siblingGap: number,
  children: readonly Node[],
  positions: Map<number, LayoutPoint>,
): SubtreeExtent | null {
  const { spanById } = metrics;
  let extent: SubtreeExtent | null = null;

  const pinnedExtents = new Map<number, SubtreeExtent>();
  for (const child of children) {
    if (!isLayoutPinned(child)) continue;
    const pinnedExtent = placePinnedSubtree(
      forest,
      metrics,
      siblingGap,
      child,
      positions,
    );
    if (pinnedExtent === null) return null;
    pinnedExtents.set(child.id, pinnedExtent);
    extent = mergeSubtreeExtent(extent, pinnedExtent);
  }

  type Segment =
    | { kind: "pinned"; extent: SubtreeExtent }
    | { kind: "run"; nodes: Node[] };
  const segments: Segment[] = [];
  let run: Node[] = [];
  const flushRun = () => {
    if (run.length === 0) return;
    segments.push({ kind: "run", nodes: run });
    run = [];
  };
  for (const child of children) {
    if (isLayoutPinned(child)) {
      flushRun();
      segments.push({ kind: "pinned", extent: pinnedExtents.get(child.id)! });
    } else {
      run.push(child);
    }
  }
  flushRun();

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    if (segment.kind === "pinned") continue;

    const prev = index > 0 ? segments[index - 1] : null;
    const next = index + 1 < segments.length ? segments[index + 1] : null;
    const height = runSpanHeight(segment.nodes, spanById, siblingGap);
    if (height === null) return null;

    let startTop: number;
    if (prev?.kind === "pinned" && next?.kind === "pinned") {
      // 両側ピン: [prev.bottom+gap, next.top-gap] に収まること。不足なら null
      const afterPrev = checkedAdd(prev.extent.bottom, siblingGap);
      if (afterPrev === null) return null;
      const beforeNext = checkedSubtract(next.extent.top, siblingGap);
      if (beforeNext === null) return null;
      const available = checkedSubtract(beforeNext, afterPrev);
      if (available === null || available < height) return null;
      startTop = afterPrev;
    } else if (prev?.kind === "pinned") {
      const afterPrev = checkedAdd(prev.extent.bottom, siblingGap);
      if (afterPrev === null) return null;
      startTop = afterPrev;
    } else if (next?.kind === "pinned") {
      const beforeNext = checkedSubtract(next.extent.top, siblingGap);
      if (beforeNext === null) return null;
      const alignedTop = checkedSubtract(beforeNext, height);
      if (alignedTop === null) return null;
      startTop = alignedTop;
    } else {
      startTop = 0;
    }

    const tops = packRunTops(segment.nodes, spanById, siblingGap, startTop);
    if (tops === null) return null;
    for (const node of segment.nodes) {
      const placed = placeNodeAtTop(
        forest,
        metrics,
        siblingGap,
        node,
        tops.get(node.id)!,
        positions,
      );
      if (placed === null) return null;
      extent = mergeSubtreeExtent(extent, placed);
    }
  }

  return extent;
}

function placeNodeAtTop(
  forest: IndexedNodeForest,
  metrics: NodeLayoutMetrics,
  siblingGap: number,
  node: Node,
  frameTop: number,
  positions: Map<number, LayoutPoint>,
): SubtreeExtent | null {
  if (isLayoutPinned(node)) {
    return placePinnedSubtree(forest, metrics, siblingGap, node, positions);
  }

  const { columnX, spanById, childrenHeightById } = metrics;
  const depth = forest.depthById.get(node.id)!;
  const span = spanById.get(node.id)!;
  const yOffset = calculateCenteringOffset(span, node.height);
  if (yOffset === null) return null;
  const y = checkedAdd(frameTop, yOffset);
  if (y === null) return null;
  positions.set(node.id, { x: columnX[depth]!, y });

  const extent = extentFromPosition(node, { x: columnX[depth]!, y });
  if (extent === null) return null;

  const children = forest.childrenByParent.get(node.id) ?? [];
  if (children.length === 0) return extent;

  const childExtent = placeChildSequence(
    forest,
    metrics,
    siblingGap,
    children,
    {
      kind: "free-top",
      frameTop,
      span,
      childrenHeight: childrenHeightById.get(node.id)!,
    },
    positions,
  );
  if (childExtent === null) return null;
  return mergeSubtreeExtent(extent, childExtent);
}

/** layoutPinned を含む森の orthogonal 配置。失敗時 null。 */
export function placePinnedAwareForest(
  forest: IndexedNodeForest,
  metrics: NodeLayoutMetrics,
  siblingGap: number,
): ReadonlyMap<number, LayoutPoint> | null {
  const positions = new Map<number, LayoutPoint>();
  const { columnX, spanById, childrenHeightById } = metrics;
  const treeGap = siblingGap * 2;
  let nextTreeTop: number | null = null;
  let previousBottom: number | null = null;

  for (const [rootIndex, root] of forest.roots.entries()) {
    const hasNextRoot = rootIndex + 1 < forest.roots.length;

    if (isLayoutPinned(root)) {
      const extent = placePinnedSubtree(forest, metrics, siblingGap, root, positions);
      if (extent === null) return null;
      previousBottom = extent.bottom;
      if (hasNextRoot) {
        nextTreeTop = checkedAdd(extent.bottom, treeGap);
        if (nextTreeTop === null) return null;
      }
      continue;
    }

    const rootSpan = spanById.get(root.id)!;
    const rootTopOffset = calculateCenteringOffset(rootSpan, root.height);
    if (rootTopOffset === null) return null;

    let frameTop: number;
    let rootY: number;
    if (rootIndex === 0) {
      const top = checkedSubtract(root.y, rootTopOffset);
      if (top === null) return null;
      frameTop = top;
      rootY = root.y;
    } else {
      frameTop = nextTreeTop!;
      const y = checkedAdd(frameTop, rootTopOffset);
      if (y === null) return null;
      rootY = y;
    }

    positions.set(root.id, { x: columnX[0]!, y: rootY });
    let extent = extentFromPosition(root, { x: columnX[0]!, y: rootY });
    if (extent === null) return null;

    const children = forest.childrenByParent.get(root.id) ?? [];
    if (children.length > 0) {
      const childExtent = placeChildSequence(
        forest,
        metrics,
        siblingGap,
        children,
        {
          kind: "free-top",
          frameTop,
          span: rootSpan,
          childrenHeight: childrenHeightById.get(root.id)!,
        },
        positions,
      );
      if (childExtent === null) return null;
      extent = mergeSubtreeExtent(extent, childExtent);
    }

    previousBottom = extent.bottom;
    if (hasNextRoot) {
      nextTreeTop = checkedAdd(extent.bottom, treeGap);
      if (nextTreeTop === null) return null;
      if (previousBottom !== null
        && !hasSufficientGap(previousBottom, nextTreeTop, treeGap)) {
        return null;
      }
    }
  }

  for (const node of forest.nodes) {
    if (!positions.has(node.id)) return null;
  }
  return positions;
}
