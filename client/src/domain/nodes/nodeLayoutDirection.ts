import type { LayoutPoint } from "@/domain/nodes/nodeLayoutPlacement";
import type { TreeDirection } from "@/types/treeDirection";
import type { Node } from "@/types/node";

export function mapNodesForTreeDirection(
  nodes: readonly Node[],
  direction: TreeDirection,
): readonly Node[] {
  if (direction === "lr") return nodes;
  return nodes.map((node) => ({
    ...node,
    x: node.y,
    y: node.x,
    width: node.height,
    height: node.width,
  }));
}

export function mapLayoutPointFromTreeDirection(
  point: LayoutPoint,
  direction: TreeDirection,
): LayoutPoint {
  if (direction === "lr") return point;
  return { x: point.y, y: point.x };
}