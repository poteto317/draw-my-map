import type { Point } from "@/components/map/mapGeometry";

export const NODE_CONTEXT_MENU_SIZE = { width: 176, height: 44 } as const;

export function clampNodeContextMenuPosition(
  anchor: Point,
  container: { width: number; height: number },
): Point {
  return {
    x: Math.max(0, Math.min(anchor.x, container.width - NODE_CONTEXT_MENU_SIZE.width)),
    y: Math.max(0, Math.min(anchor.y, container.height - NODE_CONTEXT_MENU_SIZE.height)),
  };
}
