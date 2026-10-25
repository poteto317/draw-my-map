import { SIBLING_VERTICAL_GAP } from "@/config/shapes";
import {
  checkedAdd,
  checkedSubtract,
} from "@/domain/nodes/nodeLayoutArithmetic";
import type { Node } from "@/types/node";

export type SiblingSwapResult =
  | { ok: true; nodes: Node[] }
  | { ok: false; reason: "overlapping-branches" | "placement-failed" };

type BranchBounds = { top: number; bottom: number; height: number };

const PLACEMENT_FAILED: SiblingSwapResult = {
  ok: false,
  reason: "placement-failed",
};
const OVERLAPPING_BRANCHES: SiblingSwapResult = {
  ok: false,
  reason: "overlapping-branches",
};

// parentId -> 子の ID の表。nodes を1回だけ走査して作る
function buildChildrenByParent(nodes: readonly Node[]): Map<number, number[]> {
  const childrenByParent = new Map<number, number[]>();
  for (const node of nodes) {
    if (node.parentId === null) continue;
    const children = childrenByParent.get(node.parentId);
    if (children === undefined) {
      childrenByParent.set(node.parentId, [node.id]);
    } else {
      children.push(node.id);
    }
  }
  return childrenByParent;
}

// 組の各根から幅優先で子孫を集める。exclude に含まれる ID に出会ったら null
function collectBranchIds(
  roots: readonly number[],
  childrenByParent: ReadonlyMap<number, readonly number[]>,
  exclude: ReadonlySet<number> | null,
): Set<number> | null {
  const collected = new Set<number>();
  const queue: number[] = [];
  for (const rootId of roots) {
    if (exclude?.has(rootId)) return null;
    if (collected.has(rootId)) continue;
    collected.add(rootId);
    queue.push(rootId);
  }
  for (let index = 0; index < queue.length; index += 1) {
    const children = childrenByParent.get(queue[index]);
    if (children === undefined) continue;
    for (const childId of children) {
      if (exclude?.has(childId)) return null;
      if (collected.has(childId)) continue;
      collected.add(childId);
      queue.push(childId);
    }
  }
  return collected;
}

type BoundsAccumulator = {
  top: number;
  bottom: number;
  hasNode: boolean;
  failed: boolean;
};

function createAccumulator(): BoundsAccumulator {
  return { top: 0, bottom: 0, hasNode: false, failed: false };
}

function accumulate(accumulator: BoundsAccumulator, node: Node): void {
  if (accumulator.failed) return;
  const bottom = checkedAdd(node.y, node.height);
  if (bottom === null) {
    accumulator.failed = true;
    return;
  }
  if (!accumulator.hasNode) {
    accumulator.top = node.y;
    accumulator.bottom = bottom;
    accumulator.hasNode = true;
    return;
  }
  if (node.y < accumulator.top) accumulator.top = node.y;
  if (bottom > accumulator.bottom) accumulator.bottom = bottom;
}

function toBounds(accumulator: BoundsAccumulator): BranchBounds | null {
  if (accumulator.failed || !accumulator.hasNode) return null;
  const height = checkedSubtract(accumulator.bottom, accumulator.top);
  if (height === null) return null;
  return { top: accumulator.top, bottom: accumulator.bottom, height };
}

export function swapSiblingBranchPositions(
  nodes: readonly Node[],
  first: readonly number[],
  second: readonly number[],
): SiblingSwapResult {
  if (first.length === 0 || second.length === 0) return PLACEMENT_FAILED;

  const nodeIds = new Set<number>();
  for (const node of nodes) nodeIds.add(node.id);
  for (const rootId of first) if (!nodeIds.has(rootId)) return PLACEMENT_FAILED;
  for (const rootId of second) {
    if (!nodeIds.has(rootId)) return PLACEMENT_FAILED;
  }

  const childrenByParent = buildChildrenByParent(nodes);
  const firstIds = collectBranchIds(first, childrenByParent, null);
  if (firstIds === null) return PLACEMENT_FAILED;
  const secondIds = collectBranchIds(second, childrenByParent, firstIds);
  if (secondIds === null) return OVERLAPPING_BRANCHES;

  const firstAccumulator = createAccumulator();
  const secondAccumulator = createAccumulator();
  for (const node of nodes) {
    if (firstIds.has(node.id)) accumulate(firstAccumulator, node);
    else if (secondIds.has(node.id)) accumulate(secondAccumulator, node);
  }
  const firstBounds = toBounds(firstAccumulator);
  const secondBounds = toBounds(secondAccumulator);
  if (firstBounds === null || secondBounds === null) return PLACEMENT_FAILED;

  const firstIsUpper = secondBounds.top >= firstBounds.top;
  const upper = firstIsUpper ? firstBounds : secondBounds;
  const lower = firstIsUpper ? secondBounds : firstBounds;

  const rawGap = checkedSubtract(lower.top, upper.bottom);
  if (rawGap === null) return PLACEMENT_FAILED;
  // 画面の上下がすでに新しい並びと一致しているなら座標は変えない。
  // 差分を計算すると丸め誤差で 0 にならず、桁落ちと誤判定するため先に返す
  if (firstIsUpper && rawGap >= 0) return { ok: true, nodes: [...nodes] };
  const gap = rawGap >= 0 ? rawGap : SIBLING_VERTICAL_GAP;

  const newFirstTop = upper.top;
  const firstBottom = checkedAdd(upper.top, firstBounds.height);
  if (firstBottom === null) return PLACEMENT_FAILED;
  const newSecondTop = checkedAdd(firstBottom, gap);
  if (newSecondTop === null) return PLACEMENT_FAILED;
  const dyFirst = checkedSubtract(newFirstTop, firstBounds.top);
  const dySecond = checkedSubtract(newSecondTop, secondBounds.top);
  if (dyFirst === null || dySecond === null) return PLACEMENT_FAILED;

  const result: Node[] = [];
  for (const node of nodes) {
    const dy = firstIds.has(node.id)
      ? dyFirst
      : secondIds.has(node.id)
        ? dySecond
        : 0;
    if (dy === 0) {
      result.push(node);
      continue;
    }
    const y = checkedAdd(node.y, dy);
    if (y === null) return PLACEMENT_FAILED;
    result.push({ ...node, y });
  }
  return { ok: true, nodes: result };
}
