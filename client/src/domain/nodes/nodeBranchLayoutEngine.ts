import {
  checkedAdd,
  checkedMultiply,
  checkedSubtract,
  hasSufficientGap,
} from "@/domain/nodes/nodeLayoutArithmetic";
import { buildDirectionById } from "@/domain/nodes/nodeBranchLayout";
import type { IndexedNodeForest } from "@/domain/nodes/nodeLayoutForest";
import type { LayoutPoint } from "@/domain/nodes/nodeLayoutPlacement";
import { isLayoutPinned } from "@/domain/nodes/nodeLayoutPlacementShared";
import type { BranchLayout, BranchLayoutDirection } from "@/types/branchLayout";
import type { LayoutSpacing } from "@/types/layoutSpacing";
import type { Node } from "@/types/node";
import type { TreeDirection } from "@/types/treeDirection";

type AABB = { minX: number; minY: number; maxX: number; maxY: number };
type MirrorAxis = "x" | "y";

const isPinned = isLayoutPinned;

function isHorizontal(direction: BranchLayoutDirection): boolean {
  return direction === "lr" || direction === "rl";
}

function baseDirection(direction: BranchLayoutDirection): "lr" | "tb" {
  return isHorizontal(direction) ? "lr" : "tb";
}

function isReversed(direction: BranchLayoutDirection): boolean {
  return direction === "rl" || direction === "bt";
}

function mirrorAxisOf(direction: BranchLayoutDirection): MirrorAxis {
  return isHorizontal(direction) ? "x" : "y";
}

function nodeAABB(node: Node, point: LayoutPoint): AABB {
  return {
    minX: point.x,
    minY: point.y,
    maxX: point.x + node.width,
    maxY: point.y + node.height,
  };
}

function mergeAABB(a: AABB, b: AABB): AABB {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function crossSize(aabb: AABB, direction: BranchLayoutDirection): number {
  return isHorizontal(direction) ? aabb.maxY - aabb.minY : aabb.maxX - aabb.minX;
}

function crossMin(aabb: AABB, direction: BranchLayoutDirection): number {
  return isHorizontal(direction) ? aabb.minY : aabb.minX;
}

function crossMax(aabb: AABB, direction: BranchLayoutDirection): number {
  return isHorizontal(direction) ? aabb.maxY : aabb.maxX;
}

function centerOf(node: Node, point: LayoutPoint): { x: number; y: number } {
  return { x: point.x + node.width / 2, y: point.y + node.height / 2 };
}

function mirrorPositions(
  ids: readonly number[],
  nodesById: ReadonlyMap<number, Node>,
  positions: Map<number, LayoutPoint>,
  anchor: { x: number; y: number },
  axis: MirrorAxis,
): void {
  for (const id of ids) {
    const node = nodesById.get(id)!;
    if (isPinned(node)) continue;
    const point = positions.get(id)!;
    const cx = point.x + node.width / 2;
    const cy = point.y + node.height / 2;
    if (axis === "x") {
      const nextCx = 2 * anchor.x - cx;
      positions.set(id, { x: nextCx - node.width / 2, y: point.y });
    } else {
      const nextCy = 2 * anchor.y - cy;
      positions.set(id, { x: point.x, y: nextCy - node.height / 2 });
    }
  }
}

function collectDescendantIds(rootId: number, forest: IndexedNodeForest): number[] {
  const ids: number[] = [];
  const stack = [...(forest.childrenByParent.get(rootId) ?? [])].map((n) => n.id);
  while (stack.length > 0) {
    const id = stack.pop()!;
    ids.push(id);
    for (const child of forest.childrenByParent.get(id) ?? []) {
      stack.push(child.id);
    }
  }
  return ids;
}

/** ピン配下はピンを局所原点とするため、祖先鏡映の対象から外す。 */
function collectMirrorIds(rootId: number, forest: IndexedNodeForest): number[] {
  const ids: number[] = [];
  const stack = [...(forest.childrenByParent.get(rootId) ?? [])];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (isPinned(node)) continue;
    ids.push(node.id);
    for (const child of forest.childrenByParent.get(node.id) ?? []) {
      stack.push(child);
    }
  }
  return ids;
}

function aabbOfIds(
  ids: readonly number[],
  includeRoot: Node,
  rootPoint: LayoutPoint,
  nodesById: ReadonlyMap<number, Node>,
  positions: ReadonlyMap<number, LayoutPoint>,
): AABB {
  let aabb = nodeAABB(includeRoot, rootPoint);
  for (const id of ids) {
    const node = nodesById.get(id)!;
    aabb = mergeAABB(aabb, nodeAABB(node, positions.get(id)!));
  }
  return aabb;
}

type MeasureCache = Map<number, AABB>;

/**
 * ノード単位の方向空間:
 * 祖先が同軸を後で鏡映するなら、実効逆転は XOR（反対方向は局所鏡映で打ち消す）。
 */
function resolveLocalMirror(
  direction: BranchLayoutDirection,
  skipMirrorAxis: MirrorAxis | null,
): { axis: MirrorAxis; willLocalMirror: boolean; childSkipAxis: MirrorAxis | null } {
  const axis = mirrorAxisOf(direction);
  const ancestorMirrorsOurAxis = skipMirrorAxis === axis;
  const willLocalMirror = isReversed(direction) !== ancestorMirrorsOurAxis;
  return {
    axis,
    willLocalMirror,
    childSkipAxis: willLocalMirror ? axis : skipMirrorAxis,
  };
}

function measureSubtreeAABB(
  root: Node,
  forest: IndexedNodeForest,
  dirById: ReadonlyMap<number, BranchLayoutDirection>,
  nodesById: ReadonlyMap<number, Node>,
  spacing: LayoutSpacing,
  cache: MeasureCache,
): AABB | null {
  const cached = cache.get(root.id);
  if (cached !== undefined) return cached;

  const positions = new Map<number, LayoutPoint>();
  positions.set(root.id, { x: 0, y: 0 });
  // 計測空間は root を (0,0) に置く。ピンは root ワールド原点からの相対オフセットで書く。
  if (!placeDescendants(
    root,
    forest,
    dirById,
    nodesById,
    spacing,
    positions,
    cache,
    null,
    { x: root.x, y: root.y },
  )) return null;

  const descendantIds = collectDescendantIds(root.id, forest);
  const aabb = aabbOfIds(descendantIds, root, positions.get(root.id)!, nodesById, positions);
  cache.set(root.id, aabb);
  return aabb;
}

function placeChildAlongForward(
  parent: Node,
  parentPos: LayoutPoint,
  child: Node,
  forward: "lr" | "tb",
  crossPos: number,
  childGap: number,
): LayoutPoint | null {
  if (forward === "lr") {
    const x = checkedAdd(parentPos.x + parent.width, childGap);
    if (x === null) return null;
    return { x, y: crossPos };
  }
  const y = checkedAdd(parentPos.y + parent.height, childGap);
  if (y === null) return null;
  return { x: crossPos, y };
}

function placeDescendants(
  parent: Node,
  forest: IndexedNodeForest,
  dirById: ReadonlyMap<number, BranchLayoutDirection>,
  nodesById: ReadonlyMap<number, Node>,
  spacing: LayoutSpacing,
  positions: Map<number, LayoutPoint>,
  cache: MeasureCache,
  skipMirrorAxis: MirrorAxis | null,
  measureOrigin: LayoutPoint | null,
): boolean {
  const children = forest.childrenByParent.get(parent.id) ?? [];
  if (children.length === 0) return true;

  if (children.some(isPinned)) {
    return placeMixedChildren(
      parent,
      children,
      forest,
      dirById,
      nodesById,
      spacing,
      positions,
      cache,
      skipMirrorAxis,
      measureOrigin,
    );
  }

  return placeUnpinnedChildren(
    parent,
    children,
    forest,
    dirById,
    nodesById,
    spacing,
    positions,
    cache,
    skipMirrorAxis,
    measureOrigin,
  );
}

function placeUnpinnedChildren(
  parent: Node,
  children: readonly Node[],
  forest: IndexedNodeForest,
  dirById: ReadonlyMap<number, BranchLayoutDirection>,
  nodesById: ReadonlyMap<number, Node>,
  spacing: LayoutSpacing,
  positions: Map<number, LayoutPoint>,
  cache: MeasureCache,
  skipMirrorAxis: MirrorAxis | null,
  measureOrigin: LayoutPoint | null,
): boolean {
  const parentDirection = dirById.get(parent.id)!;
  const forward = baseDirection(parentDirection);
  const parentPos = positions.get(parent.id)!;
  const { childGap, siblingGap } = spacing;

  const childSpans: { child: Node; span: number; relativeMin: number }[] = [];
  for (const child of children) {
    const measured = measureSubtreeAABB(child, forest, dirById, nodesById, spacing, cache);
    if (measured === null) return false;
    childSpans.push({
      child,
      span: crossSize(measured, forward),
      relativeMin: crossMin(measured, forward),
    });
  }

  let childrenCross = 0;
  for (const [index, entry] of childSpans.entries()) {
    const next = checkedAdd(childrenCross, entry.span);
    if (next === null) return false;
    childrenCross = next;
    if (index + 1 < childSpans.length) {
      const withGap = checkedAdd(childrenCross, siblingGap);
      if (withGap === null) return false;
      childrenCross = withGap;
    }
  }

  const parentCenter = centerOf(parent, parentPos);
  const half = checkedMultiply(childrenCross, 0.5);
  if (half === null) return false;
  const crossStart = checkedSubtract(
    isHorizontal(forward) ? parentCenter.y : parentCenter.x,
    half,
  );
  if (crossStart === null) return false;

  const { axis, willLocalMirror, childSkipAxis } = resolveLocalMirror(
    parentDirection,
    skipMirrorAxis,
  );

  let cursor = crossStart;
  for (const [index, entry] of childSpans.entries()) {
    const { child, span, relativeMin } = entry;
    const crossPos = checkedSubtract(cursor, relativeMin);
    if (crossPos === null) return false;

    const point = placeChildAlongForward(parent, parentPos, child, forward, crossPos, childGap);
    if (point === null) return false;
    positions.set(child.id, point);

    if (!placeDescendants(
      child,
      forest,
      dirById,
      nodesById,
      spacing,
      positions,
      cache,
      childSkipAxis,
      measureOrigin,
    )) return false;

    if (index + 1 < childSpans.length) {
      const after = checkedAdd(cursor, span);
      if (after === null) return false;
      const next = checkedAdd(after, siblingGap);
      if (next === null) return false;
      cursor = next;
    }
  }

  if (willLocalMirror) {
    const ids = collectMirrorIds(parent.id, forest);
    mirrorPositions(ids, nodesById, positions, parentCenter, axis);
  }

  return true;
}

type CrossSegment =
  | { kind: "pinned"; child: Node; min: number; max: number }
  | { kind: "run"; nodes: Node[] };

function placePinnedSubtree(
  pinned: Node,
  forest: IndexedNodeForest,
  dirById: ReadonlyMap<number, BranchLayoutDirection>,
  nodesById: ReadonlyMap<number, Node>,
  spacing: LayoutSpacing,
  positions: Map<number, LayoutPoint>,
  cache: MeasureCache,
  measureOrigin: LayoutPoint | null,
): AABB | null {
  // 計測中は相対オフセット。本番配置はワールド絶対座標。
  const point = measureOrigin === null
    ? { x: pinned.x, y: pinned.y }
    : { x: pinned.x - measureOrigin.x, y: pinned.y - measureOrigin.y };
  positions.set(pinned.id, point);
  // ピンは局所原点: 祖先の skipMirrorAxis をリセットし、ピン実効方向どおり鏡映する。
  if (!placeDescendants(
    pinned,
    forest,
    dirById,
    nodesById,
    spacing,
    positions,
    cache,
    null,
    measureOrigin,
  )) return null;
  const descendantIds = collectDescendantIds(pinned.id, forest);
  return aabbOfIds(
    descendantIds,
    pinned,
    positions.get(pinned.id)!,
    nodesById,
    positions,
  );
}

function placeMixedChildren(
  parent: Node,
  children: readonly Node[],
  forest: IndexedNodeForest,
  dirById: ReadonlyMap<number, BranchLayoutDirection>,
  nodesById: ReadonlyMap<number, Node>,
  spacing: LayoutSpacing,
  positions: Map<number, LayoutPoint>,
  cache: MeasureCache,
  skipMirrorAxis: MirrorAxis | null,
  measureOrigin: LayoutPoint | null,
): boolean {
  const parentDirection = dirById.get(parent.id)!;
  const forward = baseDirection(parentDirection);
  const parentPos = positions.get(parent.id)!;
  const { childGap, siblingGap } = spacing;
  const parentCenter = centerOf(parent, parentPos);

  const { axis, willLocalMirror, childSkipAxis } = resolveLocalMirror(
    parentDirection,
    skipMirrorAxis,
  );

  const pinnedAABB = new Map<number, AABB>();
  for (const child of children) {
    if (!isPinned(child)) continue;
    const aabb = placePinnedSubtree(
      child,
      forest,
      dirById,
      nodesById,
      spacing,
      positions,
      cache,
      measureOrigin,
    );
    if (aabb === null) return false;
    pinnedAABB.set(child.id, aabb);
  }

  const segments: CrossSegment[] = [];
  let run: Node[] = [];
  const flushRun = () => {
    if (run.length === 0) return;
    segments.push({ kind: "run", nodes: run });
    run = [];
  };
  for (const child of children) {
    if (isPinned(child)) {
      flushRun();
      const aabb = pinnedAABB.get(child.id)!;
      segments.push({
        kind: "pinned",
        child,
        min: crossMin(aabb, forward),
        max: crossMax(aabb, forward),
      });
    } else {
      run.push(child);
    }
  }
  flushRun();

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    if (segment.kind === "pinned") continue;

    const runSpans: { child: Node; span: number; relativeMin: number }[] = [];
    let runCross = 0;
    for (const [runIndex, child] of segment.nodes.entries()) {
      const measured = measureSubtreeAABB(child, forest, dirById, nodesById, spacing, cache);
      if (measured === null) return false;
      const span = crossSize(measured, forward);
      runSpans.push({ child, span, relativeMin: crossMin(measured, forward) });
      const next = checkedAdd(runCross, span);
      if (next === null) return false;
      runCross = next;
      if (runIndex + 1 < segment.nodes.length) {
        const withGap = checkedAdd(runCross, siblingGap);
        if (withGap === null) return false;
        runCross = withGap;
      }
    }

    const prev = index > 0 ? segments[index - 1] : null;
    const next = index + 1 < segments.length ? segments[index + 1] : null;

    let cursor: number;
    if (prev?.kind === "pinned" && next?.kind === "pinned") {
      const afterPrev = checkedAdd(prev.max, siblingGap);
      if (afterPrev === null) return false;
      const beforeNext = checkedSubtract(next.min, siblingGap);
      if (beforeNext === null) return false;
      const available = checkedSubtract(beforeNext, afterPrev);
      if (available === null || available < runCross) return false;
      cursor = afterPrev;
    } else if (prev?.kind === "pinned") {
      const afterPrev = checkedAdd(prev.max, siblingGap);
      if (afterPrev === null) return false;
      cursor = afterPrev;
    } else if (next?.kind === "pinned") {
      const beforeNext = checkedSubtract(next.min, siblingGap);
      if (beforeNext === null) return false;
      const aligned = checkedSubtract(beforeNext, runCross);
      if (aligned === null) return false;
      cursor = aligned;
    } else {
      const half = checkedMultiply(runCross, 0.5);
      if (half === null) return false;
      const start = checkedSubtract(
        isHorizontal(forward) ? parentCenter.y : parentCenter.x,
        half,
      );
      if (start === null) return false;
      cursor = start;
    }

    for (const [runIndex, entry] of runSpans.entries()) {
      const crossPos = checkedSubtract(cursor, entry.relativeMin);
      if (crossPos === null) return false;
      const point = placeChildAlongForward(
        parent,
        parentPos,
        entry.child,
        forward,
        crossPos,
        childGap,
      );
      if (point === null) return false;
      positions.set(entry.child.id, point);
      if (!placeDescendants(
        entry.child,
        forest,
        dirById,
        nodesById,
        spacing,
        positions,
        cache,
        childSkipAxis,
        measureOrigin,
      )) return false;

      if (runIndex + 1 < runSpans.length) {
        const after = checkedAdd(cursor, entry.span);
        if (after === null) return false;
        const nextCursor = checkedAdd(after, siblingGap);
        if (nextCursor === null) return false;
        cursor = nextCursor;
      }
    }
  }

  if (willLocalMirror) {
    const ids = collectMirrorIds(parent.id, forest);
    mirrorPositions(ids, nodesById, positions, parentCenter, axis);
  }

  return true;
}

function stackRoots(
  roots: readonly Node[],
  forest: IndexedNodeForest,
  dirById: ReadonlyMap<number, BranchLayoutDirection>,
  nodesById: ReadonlyMap<number, Node>,
  documentDirection: TreeDirection,
  spacing: LayoutSpacing,
  positions: Map<number, LayoutPoint>,
): boolean {
  const cache: MeasureCache = new Map();
  const treeGap = spacing.siblingGap * 2;
  const stackHorizontal = documentDirection === "tb";

  let nextTop: number | null = null;

  for (const [rootIndex, root] of roots.entries()) {
    if (isPinned(root)) {
      positions.set(root.id, { x: root.x, y: root.y });
    } else if (rootIndex === 0) {
      positions.set(root.id, { x: root.x, y: root.y });
    } else {
      const measured = measureSubtreeAABB(root, forest, dirById, nodesById, spacing, cache);
      if (measured === null || nextTop === null) return false;
      if (stackHorizontal) {
        positions.set(root.id, {
          x: nextTop - measured.minX,
          y: root.y,
        });
      } else {
        positions.set(root.id, {
          x: root.x,
          y: nextTop - measured.minY,
        });
      }
    }

    if (!placeDescendants(
      root,
      forest,
      dirById,
      nodesById,
      spacing,
      positions,
      cache,
      null,
      null,
    )) return false;

    if (rootIndex + 1 < roots.length) {
      const descendantIds = collectDescendantIds(root.id, forest);
      const aabb = aabbOfIds(
        descendantIds,
        root,
        positions.get(root.id)!,
        nodesById,
        positions,
      );
      const edge = stackHorizontal ? aabb.maxX : aabb.maxY;
      const next = checkedAdd(edge, treeGap);
      if (next === null) return false;
      nextTop = next;
    }
  }
  return true;
}

/**
 * 親の成長軸に直交する辺で兄弟間隔を検証する。
 * 比較ペアの少なくとも一方が layoutPinned ならスキップ（設計 §5）。
 */
function hasValidBranchSiblingSpacing(
  forest: IndexedNodeForest,
  dirById: ReadonlyMap<number, BranchLayoutDirection>,
  positions: ReadonlyMap<number, LayoutPoint>,
  siblingGap: number,
): boolean {
  for (const parent of forest.nodes) {
    const children = forest.childrenByParent.get(parent.id) ?? [];
    if (children.length < 2) continue;
    const forward = baseDirection(dirById.get(parent.id)!);
    const ordered = [...children].sort((a, b) => {
      const aPos = positions.get(a.id)!;
      const bPos = positions.get(b.id)!;
      const aCross = isHorizontal(forward) ? aPos.y : aPos.x;
      const bCross = isHorizontal(forward) ? bPos.y : bPos.x;
      return aCross - bCross;
    });
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1]!;
      const current = ordered[index]!;
      if (isPinned(previous) || isPinned(current)) continue;
      const prevPos = positions.get(previous.id)!;
      const currPos = positions.get(current.id)!;
      if (isHorizontal(forward)) {
        const previousBottom = checkedAdd(prevPos.y, previous.height);
        if (previousBottom === null) return false;
        if (!hasSufficientGap(previousBottom, currPos.y, siblingGap)) return false;
      } else {
        const previousRight = checkedAdd(prevPos.x, previous.width);
        if (previousRight === null) return false;
        if (!hasSufficientGap(previousRight, currPos.x, siblingGap)) return false;
      }
    }
  }
  return true;
}

/** orthogonal + branchLayouts 用。radial からは呼ばない。 */
export function layoutForestWithBranchLayouts(
  forest: IndexedNodeForest,
  spacing: LayoutSpacing,
  documentDirection: TreeDirection,
  branchLayouts: readonly BranchLayout[],
): ReadonlyMap<number, LayoutPoint> | null {
  const nodesById = new Map(forest.nodes.map((node) => [node.id, node]));
  const dirById = buildDirectionById(forest.nodes, branchLayouts, documentDirection);
  const positions = new Map<number, LayoutPoint>();
  if (!stackRoots(
    forest.roots,
    forest,
    dirById,
    nodesById,
    documentDirection,
    spacing,
    positions,
  )) return null;

  for (const node of forest.nodes) {
    if (!positions.has(node.id)) return null;
  }

  if (!hasValidBranchSiblingSpacing(
    forest,
    dirById,
    positions,
    spacing.siblingGap,
  )) return null;

  return positions;
}
