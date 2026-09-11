import type { Viewport } from "@/components/map/mapViewport";
import { createPinchZoomGesture, type PinchZoomGesture } from "@/components/map/pixi/pinchZoomGesture";
import type { LatestValue, PointerSample } from "@/components/map/pixi/pointerGesture";

type Options = {
  viewportRef: LatestValue<Viewport>;
  onViewportChangeRef: LatestValue<(viewport: Viewport) => void>;
  onBeforePinch: () => boolean;
};

export type TouchGestureCoordinator = {
  pointerDown: (sample: PointerSample) => boolean;
  pointerMove: (sample: PointerSample) => boolean;
  pointerUp: (sample: PointerSample) => void;
  cancel: () => void;
  reset: () => void;
  hasActivePinch: () => boolean;
};

export function createTouchGestureCoordinator({
  viewportRef,
  onViewportChangeRef,
  onBeforePinch,
}: Options): TouchGestureCoordinator {
  let activePinch: PinchZoomGesture | null = null;
  const samples = new Map<number, PointerSample>();
  let suppressUntilAllReleased = false;
  let generation = 0;

  const cancel = () => {
    const hadActivePinch = activePinch !== null;
    activePinch?.cancel();
    activePinch = null;
    if (hadActivePinch && samples.size > 0) suppressUntilAllReleased = true;
  };

  return {
    pointerDown(sample) {
      if (sample.pointerType !== "touch") return false;
      if (!samples.has(sample.pointerId)) samples.set(sample.pointerId, sample);
      if (suppressUntilAllReleased || activePinch || samples.size > 2) return true;
      if (samples.size < 2) return false;

      const generationAtStart = generation;
      const [firstId, secondId] = [...samples.keys()];
      const canStartPinch = onBeforePinch();
      const first = samples.get(firstId);
      const second = samples.get(secondId);
      if (
        !canStartPinch
        || generation !== generationAtStart
        || samples.size !== 2
        || !first
        || !second
      ) {
        if (generation === generationAtStart && samples.size > 0) {
          suppressUntilAllReleased = true;
        }
        return true;
      }
      activePinch = createPinchZoomGesture({
        first,
        second,
        startViewport: viewportRef.current,
        onViewportChangeRef,
      });
      return true;
    },
    pointerMove(sample) {
      if (sample.pointerType !== "touch") return false;
      if (!samples.has(sample.pointerId)) return false;
      samples.set(sample.pointerId, sample);
      if (activePinch) {
        activePinch.move(sample);
        return true;
      }
      return suppressUntilAllReleased;
    },
    pointerUp(sample) {
      if (sample.pointerType !== "touch") return;
      samples.delete(sample.pointerId);
      if (activePinch?.owns(sample.pointerId)) {
        activePinch.end(sample.pointerId);
        activePinch = null;
        suppressUntilAllReleased = true;
      }
      if (samples.size === 0) suppressUntilAllReleased = false;
    },
    cancel,
    reset() {
      generation += 1;
      cancel();
      samples.clear();
      suppressUntilAllReleased = false;
    },
    hasActivePinch: () => activePinch !== null,
  };
}
