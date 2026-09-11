import type { Point } from "@/components/map/mapGeometry";

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
    && viewport.scale >= MIN_VIEWPORT_SCALE
    && viewport.scale <= MAX_VIEWPORT_SCALE;
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
  const candidate = {
    ...viewport,
    offsetX: viewport.offsetX + dx,
    offsetY: viewport.offsetY + dy,
  };
  return isValidViewport(candidate) ? candidate : viewport;
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
  if (scale === viewport.scale) return viewport;
  const scaleRatio = scale / viewport.scale;
  const candidate = {
    offsetX: anchor.x * (1 - scaleRatio) + viewport.offsetX * scaleRatio,
    offsetY: anchor.y * (1 - scaleRatio) + viewport.offsetY * scaleRatio,
    scale,
  };
  return isValidViewport(candidate) ? candidate : viewport;
}
