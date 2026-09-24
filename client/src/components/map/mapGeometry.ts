import type { Node } from "@/types/node";
import type { Point } from "@/domain/nodes/nodeEdgeCurve";

export type { EdgeCurve, Point } from "@/domain/nodes/nodeEdgeCurve";
export { getNodeEdgeCurve as getEdgeCurve } from "@/domain/nodes/nodeEdgeCurve";


export function toLocalPoint(
  clientX: number,
  clientY: number,
  bounds: Pick<DOMRect, "left" | "top">,
): Point {
  return { x: clientX - bounds.left, y: clientY - bounds.top };
}

export function findNodeAtPoint(nodes: readonly Node[], point: Point): Node | undefined {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (
      point.x >= node.x && point.x <= node.x + node.width
      && point.y >= node.y && point.y <= node.y + node.height
    ) {
      return node;
    }
  }

  return undefined;
}
