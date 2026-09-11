import { panViewport, type Viewport } from "@/components/map/mapViewport";
import { createDragActivation } from "@/components/map/pixi/dragActivation";
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
  const dragActivation = createDragActivation(startSample.screen, dragThreshold);
  let active = true;
  const finish = () => { active = false; };

  return {
    move(sample) {
      if (!active) return;
      const movement = dragActivation.update(sample.screen);
      if (!movement) return;
      onViewportChangeRef.current(panViewport(startViewport, movement.x, movement.y));
    },
    end: finish,
    cancel: finish,
  };
}
