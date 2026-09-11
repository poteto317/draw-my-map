import { screenToWorld, type Viewport } from "@/components/map/mapViewport";
import type { PointerSample } from "@/components/map/pixi/pointerGesture";
import type { FederatedPointerEvent } from "pixi.js";

type PointerEventCoordinates = Pick<
  FederatedPointerEvent,
  "globalX" | "globalY" | "pointerId" | "pointerType"
>;

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
