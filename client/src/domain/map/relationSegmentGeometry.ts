import type { Point } from "@/domain/nodes/nodeEdgeCurve";
import type { Node } from "@/types/node";

type NodeBox = Pick<Node, "x" | "y" | "width" | "height">;

function nodeCenter(node: NodeBox): Point {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

/**
 * 中心から toward 方向へ伸ばした半直線が、矩形の外周と交わる点。
 * ノード上に線・矢印が隠れないよう、関連線の端点をアウトラインに置く。
 */
export function exitPointOnNodeOutline(node: NodeBox, toward: Point): Point {
  const center = nodeCenter(node);
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (dx === 0 && dy === 0) return center;

  const halfW = node.width / 2;
  const halfH = node.height / 2;
  const tx = dx === 0 ? Number.POSITIVE_INFINITY : halfW / Math.abs(dx);
  const ty = dy === 0 ? Number.POSITIVE_INFINITY : halfH / Math.abs(dy);
  const t = Math.min(tx, ty);
  return { x: center.x + dx * t, y: center.y + dy * t };
}

export type RelationSegment = {
  start: Point;
  end: Point;
};

/** 両端ノードのアウトライン間の線分。重なりすぎて外に出られないときは null */
export function relationSegmentOutsideNodes(
  fromNode: NodeBox,
  toNode: NodeBox,
): RelationSegment | null {
  const fromCenter = nodeCenter(fromNode);
  const toCenter = nodeCenter(toNode);
  const start = exitPointOnNodeOutline(fromNode, toCenter);
  const end = exitPointOnNodeOutline(toNode, fromCenter);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx * dx + dy * dy < 1) return null;
  return { start, end };
}
