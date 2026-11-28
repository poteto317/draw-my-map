import type { WorldRect } from "@/domain/nodes/cullNodesInViewport";
import type { Node } from "@/types/node";

type NodeBox = Pick<Node, "id" | "parentId" | "x" | "y" | "width" | "height">;

function nodeCenter(node: NodeBox): { x: number; y: number } {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

/**
 * 線分とパッド付き AABB の交差判定。
 * 一端のみ矩形内／両端外でも線分が矩形を横切る場合も true。
 */
export function segmentIntersectsPaddedAabb(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rect: WorldRect,
  padding: number,
): boolean {
  const pad = Number.isFinite(padding) && padding > 0 ? padding : 0;
  const left = rect.x - pad;
  const top = rect.y - pad;
  const right = rect.x + rect.width + pad;
  const bottom = rect.y + rect.height + pad;

  const p1Inside = x1 >= left && x1 <= right && y1 >= top && y1 <= bottom;
  const p2Inside = x2 >= left && x2 <= right && y2 >= top && y2 <= bottom;
  if (p1Inside || p2Inside) return true;

  // Liang–Barsky: 両端外でも辺を横切る線分を検出
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const clips: Array<[number, number]> = [
    [-dx, x1 - left],
    [dx, right - x1],
    [-dy, y1 - top],
    [dy, bottom - y1],
  ];
  for (const [p, q] of clips) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return t0 <= t1;
}

/** presence 枝（child id）を線分×AABB で間引く。表示座標の中心同士を線分とする。 */
export function cullPresenceEdgeChildIds(
  childIds: readonly number[],
  nodesById: ReadonlyMap<number, NodeBox>,
  worldRect: WorldRect,
  padding: number,
): number[] {
  const kept: number[] = [];
  for (const childId of childIds) {
    const child = nodesById.get(childId);
    if (!child || child.parentId === null) continue;
    const parent = nodesById.get(child.parentId);
    if (!parent) continue;
    const from = nodeCenter(parent);
    const to = nodeCenter(child);
    if (segmentIntersectsPaddedAabb(from.x, from.y, to.x, to.y, worldRect, padding)) {
      kept.push(childId);
    }
  }
  return kept;
}
