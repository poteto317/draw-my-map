import { isValidScreenSize, isValidViewport, type ScreenSize, type Viewport } from "@/components/map/mapViewport";
import type { Node } from "@/types/node";

export type WorldPoint = {
  readonly x: number;
  readonly y: number;
};

/** ワールド点を画面中央に置く（倍率維持のパン）。 */
export function focusViewportOnWorldPoint(
  viewport: Viewport,
  worldPoint: WorldPoint,
  screen: ScreenSize,
): Viewport {
  if (!isValidViewport(viewport) || !isValidScreenSize(screen)
    || !Number.isFinite(worldPoint.x) || !Number.isFinite(worldPoint.y)) {
    return viewport;
  }
  const offsetX = screen.width / 2 - worldPoint.x * viewport.scale;
  const offsetY = screen.height / 2 - worldPoint.y * viewport.scale;
  if (offsetX === viewport.offsetX && offsetY === viewport.offsetY) return viewport;
  const candidate = {
    offsetX,
    offsetY,
    scale: viewport.scale,
  };
  return isValidViewport(candidate) ? candidate : viewport;
}

export function focusViewportOnNode(
  viewport: Viewport,
  node: Node,
  screen: ScreenSize,
): Viewport {
  if (!isValidViewport(viewport) || !isValidScreenSize(screen)) {
    return viewport;
  }
  return focusViewportOnWorldPoint(
    viewport,
    { x: node.x + node.width / 2, y: node.y + node.height / 2 },
    screen,
  );
}
