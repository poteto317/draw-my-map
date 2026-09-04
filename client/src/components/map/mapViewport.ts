import type { Point } from "@/components/map/mapGeometry";
import type { Node } from "@/types/node";

export type Viewport = {
  offsetX: number;
  offsetY: number;
  scale: number;
};

export type ScreenSize = { width: number; height: number };

export const INITIAL_VIEWPORT: Viewport = { offsetX: 0, offsetY: 0, scale: 1 };
export const MIN_VIEWPORT_SCALE = 0.25;
export const MAX_VIEWPORT_SCALE = 4;

export function isValidViewport(viewport: Viewport): boolean {
  return Number.isFinite(viewport.offsetX)
    && Number.isFinite(viewport.offsetY)
    && Number.isFinite(viewport.scale)
    && viewport.scale > 0;
}

export function worldToScreen(point: Point, viewport: Viewport): Point {
  return {
    x: point.x * viewport.scale + viewport.offsetX,
    y: point.y * viewport.scale + viewport.offsetY,
  };
}

export function screenToWorld(point: Point, viewport: Viewport): Point {
  return {
    x: (point.x - viewport.offsetX) / viewport.scale,
    y: (point.y - viewport.offsetY) / viewport.scale,
  };
}

export function panViewport(viewport: Viewport, dx: number, dy: number): Viewport {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !isValidViewport(viewport)) {
    return viewport;
  }
  return { ...viewport, offsetX: viewport.offsetX + dx, offsetY: viewport.offsetY + dy };
}

export function clampViewportScale(scale: number): number {
  return Math.min(MAX_VIEWPORT_SCALE, Math.max(MIN_VIEWPORT_SCALE, scale));
}

export function zoomViewportAt(
  viewport: Viewport,
  anchor: Point,
  requestedScale: number,
): Viewport {
  if (!isValidViewport(viewport)
    || !Number.isFinite(anchor.x)
    || !Number.isFinite(anchor.y)
    || !Number.isFinite(requestedScale)
    || requestedScale <= 0) {
    return viewport;
  }
  const scale = clampViewportScale(requestedScale);
  const worldAnchor = screenToWorld(anchor, viewport);
  return {
    offsetX: anchor.x - worldAnchor.x * scale,
    offsetY: anchor.y - worldAnchor.y * scale,
    scale,
  };
}

export function focusViewportOnNode(
  viewport: Viewport,
  node: Node,
  screen: ScreenSize,
): Viewport {
  if (!isValidViewport(viewport)
    || !Number.isFinite(screen.width)
    || !Number.isFinite(screen.height)) {
    return viewport;
  }
  const center = { x: node.x + node.width / 2, y: node.y + node.height / 2 };
  if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) return viewport;
  return {
    offsetX: screen.width / 2 - center.x * viewport.scale,
    offsetY: screen.height / 2 - center.y * viewport.scale,
    scale: viewport.scale,
  };
}
