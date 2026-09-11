import type { Point } from "@/components/map/mapGeometry";

export function createDragActivation(start: Point, threshold: number) {
  const origin = { ...start };
  let active = false;

  return {
    update(point: Point): Point | null {
      const movement = { x: point.x - origin.x, y: point.y - origin.y };
      if (!active) {
        if (Math.abs(movement.x) < threshold && Math.abs(movement.y) < threshold) {
          return null;
        }
        active = true;
      }
      return movement;
    },
  };
}
