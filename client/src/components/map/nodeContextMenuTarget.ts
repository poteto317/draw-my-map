import { findNodeAtPoint, toLocalPoint, type Point } from "@/components/map/mapGeometry";
import { screenToWorld, type Viewport } from "@/components/map/mapViewport";
import type { Node } from "@/types/node";

export type NodeContextMenuTarget = { nodeId: number; anchor: Point };

type NodeContextMenuTargetInput = {
  client: Point;
  bounds: Pick<DOMRect, "left" | "top">;
  viewport: Viewport;
  nodes: readonly Node[];
};

export function resolveNodeContextMenuTarget({
  client,
  bounds,
  viewport,
  nodes,
}: NodeContextMenuTargetInput): NodeContextMenuTarget | null {
  const anchor = toLocalPoint(client.x, client.y, bounds);
  const world = screenToWorld(anchor, viewport);
  if (!Number.isFinite(world.x) || !Number.isFinite(world.y)) return null;

  const node = findNodeAtPoint(nodes, world);
  return node ? { nodeId: node.id, anchor } : null;
}
