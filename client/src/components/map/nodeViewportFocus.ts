import { isValidViewport, type ScreenSize, type Viewport } from "@/components/map/mapViewport";
import type { Node } from "@/types/node";

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
  const offsetX = screen.width / 2 - center.x * viewport.scale;
  const offsetY = screen.height / 2 - center.y * viewport.scale;
  if (offsetX === viewport.offsetX && offsetY === viewport.offsetY) return viewport;
  const candidate = {
    offsetX,
    offsetY,
    scale: viewport.scale,
  };
  return isValidViewport(candidate) ? candidate : viewport;
}
