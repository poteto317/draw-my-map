import { panViewport, type Viewport } from "@/components/map/mapViewport";
import type {
  LatestValue,
  PointerGesture,
  PointerSample,
} from "@/components/map/pixi/pointerGesture";

type CanvasPanGestureOptions = {
  startSample: PointerSample;
  startViewport: Viewport;
  onViewportChangeRef: LatestValue<(viewport: Viewport) => void>;
  dragThreshold: number;
};

export function createCanvasPanGesture({
  startSample,
  startViewport,
  onViewportChangeRef,
  dragThreshold,
}: CanvasPanGestureOptions): PointerGesture {
  const startScreen = { ...startSample.screen };
  let active = true;
  let dragging = false;
  const finish = () => { active = false; };

  return {
    move(sample) {
      if (!active) return;
      const dx = sample.screen.x - startScreen.x;
      const dy = sample.screen.y - startScreen.y;
      if (!dragging) {
        if (Math.abs(dx) < dragThreshold && Math.abs(dy) < dragThreshold) return;
        dragging = true;
      }
      onViewportChangeRef.current(panViewport(startViewport, dx, dy));
    },
    end: finish,
    cancel: finish,
  };
}
