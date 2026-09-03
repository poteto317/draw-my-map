import type { Point } from "@/components/map/mapGeometry";

export type Viewport = {
  offsetX: number;
  offsetY: number;
  scale: number;
};

export const INITIAL_VIEWPORT: Viewport = { offsetX: 0, offsetY: 0, scale: 1 };

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
