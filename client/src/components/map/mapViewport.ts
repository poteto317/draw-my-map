import type { Point } from "@/components/map/mapGeometry";
import type { Node } from "@/types/node";
import {
  clampViewportScale,
  INITIAL_VIEWPORT,
  isValidScreenSize,
  isValidViewport,
  MAX_VIEWPORT_SCALE,
  MIN_VIEWPORT_SCALE,
  type ScreenSize,
  type Viewport,
} from "@/types/viewport";

export type { ScreenSize, Viewport };
export {
  clampViewportScale,
  INITIAL_VIEWPORT,
  isValidScreenSize,
  isValidViewport,
  MAX_VIEWPORT_SCALE,
  MIN_VIEWPORT_SCALE,
};

const FIT_PADDING = 48;

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

export function fitViewportToNodes(
  nodes: readonly Pick<Node, "x" | "y" | "width" | "height">[],
  screen: ScreenSize,
): Viewport | null {
  if (nodes.length === 0 || !isValidScreenSize(screen)) return null;

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const { x, y, width, height } of nodes) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !isValidScreenSize({ width, height })) return null;
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + width);
    bottom = Math.max(bottom, y + height);
  }

  // 小さな画面でも内容に使える幅と高さを半分は残す。
  const padding = Math.min(FIT_PADDING, screen.width / 4, screen.height / 4);
  const scale = clampViewportScale(Math.min(
    (screen.width - 2 * padding) / (right - left),
    (screen.height - 2 * padding) / (bottom - top),
  ));
  const viewport = {
    offsetX: screen.width / 2 - (left / 2 + right / 2) * scale,
    offsetY: screen.height / 2 - (top / 2 + bottom / 2) * scale,
    scale,
  };
  return isValidViewport(viewport) ? viewport : null;
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
