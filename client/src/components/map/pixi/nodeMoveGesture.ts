import type { LatestValue, PointerGesture } from "@/components/map/pixi/pointerGesture";
import type { Node } from "@/types/node";
import type { FederatedPointerEvent } from "pixi.js";

type NodeMoveGestureOptions = {
  nodeId: number;
  startEvent: FederatedPointerEvent;
  nodesRef: LatestValue<readonly Node[]>;
  onMoveNodeRef: LatestValue<(id: number, x: number, y: number) => void>;
  dragThreshold: number;
};

export function createNodeMoveGesture({
  nodeId,
  startEvent,
  nodesRef,
  onMoveNodeRef,
  dragThreshold,
}: NodeMoveGestureOptions): PointerGesture | null {
  const node = nodesRef.current.find((currentNode) => currentNode.id === nodeId);
  if (!node) return null;

  const startX = startEvent.globalX;
  const startY = startEvent.globalY;
  let active = true;
  let dragging = false;
  const finish = () => {
    active = false;
  };

  return {
    move(event) {
      if (!active) return;
      const dx = event.globalX - startX;
      const dy = event.globalY - startY;
      if (!dragging) {
        if (Math.abs(dx) < dragThreshold && Math.abs(dy) < dragThreshold) return;
        dragging = true;
      }
      onMoveNodeRef.current(nodeId, node.x + dx, node.y + dy);
    },
    end: finish,
    cancel: finish,
  };
}
