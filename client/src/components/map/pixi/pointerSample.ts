import { screenToWorld, type Viewport } from "@/components/map/mapViewport";
import type { PointerSample } from "@/components/map/pixi/pointerGesture";
import type { FederatedPointerEvent } from "pixi.js";

type PointerEventCoordinates = Pick<
  FederatedPointerEvent,
  "globalX" | "globalY" | "pointerId" | "pointerType"
>;

export function hasFinitePointerCoordinates(sample: PointerSample): boolean {
  return Number.isFinite(sample.screen.x)
    && Number.isFinite(sample.screen.y)
    && Number.isFinite(sample.world.x)
    && Number.isFinite(sample.world.y);
}

export function toPointerSample(
  event: PointerEventCoordinates,
  viewport: Viewport,
): PointerSample {
  const screen = { x: event.globalX, y: event.globalY };
  return {
    pointerId: event.pointerId,
    pointerType: event.pointerType || "mouse",
    screen,
    world: screenToWorld(screen, viewport),
  };
}
