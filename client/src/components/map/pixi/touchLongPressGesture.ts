import { TOUCH_LONG_PRESS_CONTEXT_MS } from "@/domain/map/touchTabletConstants";
import { createDragActivation } from "@/components/map/pixi/dragActivation";
import type { LatestValue, PointerGesture, PointerSample } from "@/components/map/pixi/pointerGesture";
import { hasFinitePointerCoordinates } from "@/components/map/pixi/pointerSample";

export type TouchLongPressContextRequest = {
  nodeId: number;
  client: { x: number; y: number };
};

type TouchLongPressGestureOptions = {
  nodeId: number;
  startSample: PointerSample;
  onLongPressContextMenuRef: LatestValue<(request: TouchLongPressContextRequest) => void>;
  createActivatedDragGesture: () => PointerGesture | null;
  dragThreshold: number;
  longPressMs?: number;
  shouldAbortLongPressRef: LatestValue<() => boolean>;
  schedule: typeof setTimeout;
  clearScheduled: typeof clearTimeout;
};

export function createTouchLongPressGesture({
  nodeId,
  startSample,
  onLongPressContextMenuRef,
  createActivatedDragGesture,
  dragThreshold,
  longPressMs = TOUCH_LONG_PRESS_CONTEXT_MS,
  shouldAbortLongPressRef,
  schedule,
  clearScheduled,
}: TouchLongPressGestureOptions): PointerGesture | null {
  if (!hasFinitePointerCoordinates(startSample)) return null;
  if (startSample.pointerType !== "touch") return null;

  const dragActivation = createDragActivation(startSample.screen, dragThreshold);
  let activated = false;
  let dragGesture: PointerGesture | null = null;
  let finished = false;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;

  const clearLongPressTimer = () => {
    if (longPressTimer === null) return;
    clearScheduled(longPressTimer);
    longPressTimer = null;
  };

  const tryFireLongPress = () => {
    if (finished || activated || shouldAbortLongPressRef.current()) return;
    finished = true;
    clearLongPressTimer();
    dragGesture?.cancel();
    dragGesture = null;
    onLongPressContextMenuRef.current({
      nodeId,
      client: { ...startSample.screen },
    });
  };

  longPressTimer = schedule(tryFireLongPress, longPressMs);

  return {
    move(sample) {
      if (finished) return;
      if (dragGesture) {
        dragGesture.move(sample);
        return;
      }
      if (!hasFinitePointerCoordinates(sample)) return;
      if (!dragActivation.update(sample.screen)) return;
      activated = true;
      clearLongPressTimer();
      dragGesture = createActivatedDragGesture();
      dragGesture?.move(sample);
    },
    end(sample) {
      if (finished) return;
      finished = true;
      clearLongPressTimer();
      if (dragGesture) {
        dragGesture.end(sample);
        return;
      }
    },
    cancel() {
      if (finished) return;
      finished = true;
      clearLongPressTimer();
      dragGesture?.cancel();
    },
    isActivated: () => activated,
    activeNodeIds: () => dragGesture?.activeNodeIds?.() ?? [nodeId],
  };
}