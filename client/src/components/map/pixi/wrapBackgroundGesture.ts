import type { PointerGesture } from "@/components/map/pixi/pointerGesture";

/** 背景ジェスチャーが未 activated のまま終端したら選択を解除する */
export function wrapBackgroundGesture(
  gesture: PointerGesture,
  onClearSelection: () => void,
): PointerGesture {
  return {
    move: (sample) => gesture.move(sample),
    end(sample) {
      const activated = gesture.isActivated?.() ?? false;
      gesture.end(sample);
      if (!activated) onClearSelection();
    },
    cancel() {
      const activated = gesture.isActivated?.() ?? false;
      gesture.cancel();
      if (!activated) onClearSelection();
    },
    isActivated: () => gesture.isActivated?.() ?? false,
  };
}
