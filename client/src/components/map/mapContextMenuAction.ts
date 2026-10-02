import type { Point } from "@/components/map/mapGeometry";
import type { Viewport } from "@/components/map/mapViewport";
import { clampNodeContextMenuPosition } from "@/components/map/nodeContextMenuLayout";
import { resolveNodeContextMenuTarget } from "@/components/map/nodeContextMenuTarget";
import type { Node } from "@/types/node";

export type MapContextMenuAction =
  | { type: "native" }
  | { type: "suppress" }
  | { type: "dismiss" }
  | { type: "select"; nodeId: number }
  | { type: "open"; nodeId: number; position: Point };

type MapContextMenuInput = {
  isEditing: boolean;
  isTextEntryTarget: boolean;
  isInsideMenu: boolean;
  hasActiveGesture: boolean;
  canOpenMenu: boolean;
  client: Point;
  bounds: Pick<DOMRect, "left" | "top" | "width" | "height">;
  viewport: Viewport;
  visibleNodes: readonly Node[];
};

export function resolveMapContextMenuAction({
  isEditing,
  isTextEntryTarget,
  isInsideMenu,
  hasActiveGesture,
  canOpenMenu,
  client,
  bounds,
  viewport,
  visibleNodes,
}: MapContextMenuInput): MapContextMenuAction {
  if (isEditing || isTextEntryTarget) return { type: "native" };
  if (isInsideMenu || hasActiveGesture) return { type: "suppress" };

  const target = resolveNodeContextMenuTarget({
    client,
    bounds,
    viewport,
    nodes: visibleNodes,
  });
  if (target === null) return { type: "dismiss" };
  if (!canOpenMenu) return { type: "select", nodeId: target.nodeId };

  return {
    type: "open",
    nodeId: target.nodeId,
    position: clampNodeContextMenuPosition(target.anchor, bounds),
  };
}
