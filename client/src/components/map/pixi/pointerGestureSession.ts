import type { PointerGesture, PointerSample } from "@/components/map/pixi/pointerGesture";

export type PointerGestureLease = {
  pointerId: number;
  gesture: PointerGesture;
};

export function createPointerGestureSession() {
  let active: PointerGestureLease | null = null;

  return {
    start(pointerId: number, gesture: PointerGesture): PointerGestureLease | null {
      if (active) return null;
      active = { pointerId, gesture };
      return active;
    },
    current: () => active,
    hasActive: () => active !== null,
    owns: (pointerId: number) => active?.pointerId === pointerId,
    move(sample: PointerSample) {
      if (active?.pointerId === sample.pointerId) active.gesture.move(sample);
    },
    end(sample: PointerSample) {
      if (active?.pointerId !== sample.pointerId) return;
      const gestureToEnd = active.gesture;
      active = null;
      gestureToEnd.end(sample);
    },
    cancel() {
      const gestureToCancel = active?.gesture;
      active = null;
      gestureToCancel?.cancel();
    },
    clear(lease: PointerGestureLease) {
      if (active === lease) active = null;
    },
  };
}
