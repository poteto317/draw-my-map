import { panViewport, zoomViewportAt, type Viewport } from "@/components/map/mapViewport";
import type { Point } from "@/components/map/mapGeometry";
import type {
  LatestValue,
  PointerSample,
} from "@/components/map/pixi/pointerGesture";

export type PinchZoomGesture = {
  move: (sample: PointerSample) => void;
  owns: (pointerId: number) => boolean;
  end: (pointerId: number) => boolean;
  cancel: () => void;
};

type Options = {
  first: PointerSample;
  second: PointerSample;
  startViewport: Viewport;
  onViewportChangeRef: LatestValue<(viewport: Viewport) => void>;
};

const midpoint = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});
const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

export function createPinchZoomGesture(options: Options): PinchZoomGesture {
  const ids = [options.first.pointerId, options.second.pointerId] as const;
  const points = new Map<number, Point>([
    [ids[0], { ...options.first.screen }],
    [ids[1], { ...options.second.screen }],
  ]);
  const startCenter = midpoint(options.first.screen, options.second.screen);
  const startDistance = distance(options.first.screen, options.second.screen);
  let active = true;

  const owns = (pointerId: number) => pointerId === ids[0] || pointerId === ids[1];
  return {
    owns,
    move(sample) {
      if (!active || !owns(sample.pointerId)) return;
      points.set(sample.pointerId, { ...sample.screen });
      const first = points.get(ids[0])!;
      const second = points.get(ids[1])!;
      const currentDistance = distance(first, second);
      if (startDistance <= 0 || !Number.isFinite(currentDistance)) return;
      const currentCenter = midpoint(first, second);
      const zoomed = zoomViewportAt(
        options.startViewport,
        startCenter,
        options.startViewport.scale * currentDistance / startDistance,
      );
      options.onViewportChangeRef.current(panViewport(
        zoomed,
        currentCenter.x - startCenter.x,
        currentCenter.y - startCenter.y,
      ));
    },
    end(pointerId) {
      if (!active || !owns(pointerId)) return false;
      active = false;
      return true;
    },
    cancel() { active = false; },
  };
}
