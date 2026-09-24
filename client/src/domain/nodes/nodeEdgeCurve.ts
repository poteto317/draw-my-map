import type { Node } from "@/types/node";

export type Point = { x: number; y: number };

export type EdgeCurve = {
  start: Point;
  control1: Point;
  control2: Point;
  end: Point;
};

export function getNodeEdgeCurve(parent: Node, child: Node): EdgeCurve {
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
