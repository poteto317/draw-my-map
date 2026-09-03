import type { LatestValue, PointerGesture, PointerSample } from "@/components/map/pixi/pointerGesture";
import type { Node } from "@/types/node";

type NodeMoveGestureOptions = {
  nodeId: number;
  startSample: PointerSample;
  nodesRef: LatestValue<readonly Node[]>;
  onMoveNodeRef: LatestValue<(id: number, x: number, y: number) => void>;
  dragThreshold: number;
};

export function createNodeMoveGesture({
  nodeId,
  startSample,
  nodesRef,
  onMoveNodeRef,
  dragThreshold,
}: NodeMoveGestureOptions): PointerGesture | null {
  const node = nodesRef.current.find((currentNode) => currentNode.id === nodeId);
  if (!node) return null;

  const startScreen = { ...startSample.screen };
  const startWorld = { ...startSample.world };
  let active = true;
  let dragging = false;
  const finish = () => {
    active = false;
  };

  return {
    move(sample) {
      if (!active) return;
      const screenDx = sample.screen.x - startScreen.x;
      const screenDy = sample.screen.y - startScreen.y;
      if (!dragging) {
        if (Math.abs(screenDx) < dragThreshold && Math.abs(screenDy) < dragThreshold) return;
        dragging = true;
      }
      onMoveNodeRef.current(
        nodeId,
        node.x + sample.world.x - startWorld.x,
        node.y + sample.world.y - startWorld.y,
      );
    },
    end: finish,
    cancel: finish,
  };
}
