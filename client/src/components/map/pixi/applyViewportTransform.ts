import type { Viewport } from "@/components/map/mapViewport";
import type { Container } from "pixi.js";

type ViewportTransformTarget = Pick<Container, "position" | "scale">;

export function applyViewportTransform(
  target: ViewportTransformTarget,
  viewport: Viewport,
): void {
  target.position.set(viewport.offsetX, viewport.offsetY);
  target.scale.set(viewport.scale);
}
