import type { LatestValue, PointerGesture, PointerSample } from "@/components/map/pixi/pointerGesture";
import { createDragActivation } from "@/components/map/pixi/dragActivation";
import type { Node } from "@/types/node";

type NodeMoveGestureOptions = {
  nodeId: number;
  startSample: PointerSample;
  nodesRef: LatestValue<readonly Node[]>;
  onMoveNodeRef: LatestValue<(id: number, x: number, y: number) => void>;
  dragThreshold: number;
};

const hasFiniteCoordinates = (sample: PointerSample): boolean => (
  Number.isFinite(sample.screen.x)
  && Number.isFinite(sample.screen.y)
  && Number.isFinite(sample.world.x)
  && Number.isFinite(sample.world.y)
);

export function createNodeMoveGesture({
  nodeId,
  startSample,
  nodesRef,
  onMoveNodeRef,
  dragThreshold,
}: NodeMoveGestureOptions): PointerGesture | null {
  const node = nodesRef.current.find((currentNode) => currentNode.id === nodeId);
  if (!node || !hasFiniteCoordinates(startSample)) return null;

  const dragActivation = createDragActivation(startSample.screen, dragThreshold);
  const startWorld = { ...startSample.world };
  let active = true;
  const finish = () => {
    active = false;
  };

  return {
    move(sample) {
      if (!active || !hasFiniteCoordinates(sample)) return;
      if (!dragActivation.update(sample.screen)) return;
      const nextX = node.x + sample.world.x - startWorld.x;
      const nextY = node.y + sample.world.y - startWorld.y;
      if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return;
      onMoveNodeRef.current(
        nodeId,
        nextX,
        nextY,
      );
    },
    end: finish,
    cancel: finish,
  };
}
