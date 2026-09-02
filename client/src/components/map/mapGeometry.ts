import type { Node } from "@/types/node";

export type Point = { x: number; y: number };

export type EdgeCurve = {
  start: Point;
  control1: Point;
  control2: Point;
  end: Point;
};

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

export function getEdgeCurve(parent: Node, child: Node): EdgeCurve {
  const start = { x: parent.x + parent.width, y: parent.y + parent.height / 2 };
  const end = { x: child.x, y: child.y + child.height / 2 };
  const controlX = (start.x + end.x) / 2;

  return {
    start,
    control1: { x: controlX, y: start.y },
    control2: { x: controlX, y: end.y },
    end,
  };
}
