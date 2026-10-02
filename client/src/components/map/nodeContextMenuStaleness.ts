import type { Viewport } from "@/components/map/mapViewport";
import type { Node } from "@/types/node";

type NodeContextMenuStalenessInput = {
  menuNodeId: number;
  menuRevision: number;
  resetRevision: number;
  visibleNodeIds: ReadonlySet<number>;
  nodes: readonly Node[];
  menuViewport: Viewport;
  viewport: Viewport;
};

export function isNodeContextMenuStale({
  menuNodeId,
  menuRevision,
  resetRevision,
  visibleNodeIds,
  nodes,
  menuViewport,
  viewport,
}: NodeContextMenuStalenessInput): boolean {
  return menuRevision !== resetRevision
    || !visibleNodeIds.has(menuNodeId)
    || !nodes.some((node) => node.id === menuNodeId)
    || menuViewport.offsetX !== viewport.offsetX
    || menuViewport.offsetY !== viewport.offsetY
    || menuViewport.scale !== viewport.scale;
}
