import type { Point } from "@/components/map/mapGeometry";
import {
  clampViewportScale,
  isValidViewport,
  panViewport,
  zoomViewportAt,
  type Viewport,
} from "@/components/map/mapViewport";

export const calculateMidpoint = (a: Point, b: Point): Point => ({
  x: a.x / 2 + b.x / 2,
  y: a.y / 2 + b.y / 2,
});

const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

export function hasFinitePositiveDistance(a: Point, b: Point): boolean {
  if (!Number.isFinite(a.x)
    || !Number.isFinite(a.y)
    || !Number.isFinite(b.x)
    || !Number.isFinite(b.y)) return false;
  const value = distance(a, b);
  return Number.isFinite(value) && value > 0;
}

export function calculatePinchViewport(
  startViewport: Viewport,
  startFirst: Point,
  startSecond: Point,
  currentFirst: Point,
  currentSecond: Point,
): Viewport | null {
  const values = [
    startFirst.x,
    startFirst.y,
    startSecond.x,
    startSecond.y,
    currentFirst.x,
    currentFirst.y,
    currentSecond.x,
    currentSecond.y,
  ];
  if (!isValidViewport(startViewport) || values.some((value) => !Number.isFinite(value))) {
    return null;
  }

  if (!hasFinitePositiveDistance(startFirst, startSecond)) return null;
  const startDistance = distance(startFirst, startSecond);
  const currentDistance = distance(currentFirst, currentSecond);
  if (!Number.isFinite(currentDistance)) return null;

  const startCenter = calculateMidpoint(startFirst, startSecond);
  const currentCenter = calculateMidpoint(currentFirst, currentSecond);
  const rawScale = startViewport.scale * (currentDistance / startDistance);
  if (!Number.isFinite(rawScale) || rawScale < 0) return null;
  const deltaX = currentCenter.x - startCenter.x;
  const deltaY = currentCenter.y - startCenter.y;
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return null;

  const requestedScale = clampViewportScale(rawScale);
  const zoomed = zoomViewportAt(
    startViewport,
    startCenter,
    requestedScale,
  );
  if (requestedScale !== startViewport.scale && zoomed === startViewport) return null;
  if (deltaX === 0 && deltaY === 0) return zoomed;
  const candidate = panViewport(
    zoomed,
    deltaX,
    deltaY,
  );
  if ((deltaX !== 0 || deltaY !== 0) && candidate === zoomed) return null;
  return candidate;
}
