import { TOUCH_NODE_HIT_PADDING_PX } from "@/domain/map/touchTabletConstants";
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

function resolveNodeHitPadding(pointerType?: string): number {
  return pointerType === "touch" ? TOUCH_NODE_HIT_PADDING_PX : 0;
}

export function findNodeAtPoint(
  nodes: readonly Node[],
  point: Point,
  pointerType?: string,
): Node | undefined {
  const padding = resolveNodeHitPadding(pointerType);
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (
      point.x >= node.x - padding && point.x <= node.x + node.width + padding
      && point.y >= node.y - padding && point.y <= node.y + node.height + padding
    ) {
      return node;
    }
  }

  return undefined;
}
