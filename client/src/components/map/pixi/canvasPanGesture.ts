import { panViewport, type Viewport } from "@/components/map/mapViewport";
import { createDragActivation } from "@/components/map/pixi/dragActivation";
import type {
  LatestValue,
  PointerGesture,
  PointerSample,
} from "@/components/map/pixi/pointerGesture";
import { hasFinitePointerCoordinates } from "@/components/map/pixi/pointerSample";

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
}: CanvasPanGestureOptions): PointerGesture | null {
  if (!hasFinitePointerCoordinates(startSample)) return null;
  const dragActivation = createDragActivation(startSample.screen, dragThreshold);
  let active = true;
  const finish = () => { active = false; };

  return {
    move(sample) {
      if (!active || !hasFinitePointerCoordinates(sample)) return;
      const movement = dragActivation.update(sample.screen);
      if (!movement) return;
      onViewportChangeRef.current(panViewport(startViewport, movement.x, movement.y));
    },
    end: finish,
    cancel: finish,
  };
}
