import { createDragActivation } from "@/components/map/pixi/dragActivation";
import type { LatestValue, PointerGesture, PointerSample } from "@/components/map/pixi/pointerGesture";
import { hasFinitePointerCoordinates } from "@/components/map/pixi/pointerSample";

type ToggleNodePendingGestureOptions = {
  nodeId: number;
  startSample: PointerSample;
  onToggleNodeSelectionRef?: LatestValue<(id: number) => void>;
  /** activated 時に stage 側が移動／並べ替えジェスチャーを生成する */
  createActivatedDragGesture: () => PointerGesture | null;
  dragThreshold: number;
};

/** Meta/Ctrl+ノード: しきい値超で移動／並べ替え、未 activated の終端で選択トグル */
export function createToggleNodePendingGesture({
  nodeId,
  startSample,
  onToggleNodeSelectionRef,
  createActivatedDragGesture,
  dragThreshold,
}: ToggleNodePendingGestureOptions): PointerGesture | null {
  if (!hasFinitePointerCoordinates(startSample)) return null;
  const dragActivation = createDragActivation(startSample.screen, dragThreshold);
  let activated = false;
  let dragGesture: PointerGesture | null = null;
  let finished = false;

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
      dragGesture = createActivatedDragGesture();
      dragGesture?.move(sample);
    },
    end(sample) {
      if (finished) return;
      finished = true;
      if (dragGesture) {
        dragGesture.end(sample);
        return;
      }
      onToggleNodeSelectionRef?.current(nodeId);
    },
    cancel() {
      if (finished) return;
      finished = true;
      dragGesture?.cancel();
    },
    isActivated: () => activated,
    activeNodeIds: () => dragGesture?.activeNodeIds?.() ?? [nodeId],
  };
}
