import {
  findNodeAtPoint,
  toLocalPoint,
  type Point,
} from "@/components/map/mapGeometry";
import { screenToWorld, type Viewport } from "@/components/map/mapViewport";
import type { Node } from "@/types/node";

export type MapDoubleClickAction =
  | { type: "edit"; nodeId: number }
  | { type: "add"; point: Point };

type MapDoubleClickInput = {
  client: Point;
  bounds: Pick<DOMRect, "left" | "top">;
  viewport: Viewport;
  nodes: readonly Node[];
};

function hasFiniteCoordinates(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

export function resolveMapDoubleClickAction({
  client,
  bounds,
  viewport,
  nodes,
}: MapDoubleClickInput): MapDoubleClickAction | null {
  const screen = toLocalPoint(client.x, client.y, bounds);
  const point = screenToWorld(screen, viewport);
  if (!hasFiniteCoordinates(point)) return null;

  const node = findNodeAtPoint(nodes, point);
  return node ? { type: "edit", nodeId: node.id } : { type: "add", point };
}
