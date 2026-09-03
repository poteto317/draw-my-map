import { findNodeAtPoint } from "@/components/map/mapGeometry";
import type { LatestValue, PointerGesture } from "@/components/map/pixi/pointerGesture";
import { canConnectNodes } from "@/domain/nodes/nodeTree";
import type { Node } from "@/types/node";

type NodeConnectionGestureOptions = {
  sourceNodeId: number;
  nodesRef: LatestValue<readonly Node[]>;
  onConnectNodesRef: LatestValue<(parentId: number, childId: number) => boolean>;
  onConnectionTargetChangeRef: LatestValue<(id: number | null) => void>;
};

export function createNodeConnectionGesture({
  sourceNodeId,
  nodesRef,
  onConnectNodesRef,
  onConnectionTargetChangeRef,
}: NodeConnectionGestureOptions): PointerGesture | null {
  if (!nodesRef.current.some((node) => node.id === sourceNodeId)) return null;

  let active = true;
  let targetNodeId: number | null = null;

  const findTargetId = (event: { globalX: number; globalY: number }) => {
    const target = findNodeAtPoint(nodesRef.current, {
      x: event.globalX,
      y: event.globalY,
    });

    return target && canConnectNodes(nodesRef.current, sourceNodeId, target.id)
      ? target.id
      : null;
  };

  const finish = () => {
    if (!active) return false;
    active = false;
    onConnectionTargetChangeRef.current(null);
    return true;
  };

  return {
    move(event) {
      if (!active) return;
      const nextTargetNodeId = findTargetId(event);
      if (nextTargetNodeId === targetNodeId) return;
      targetNodeId = nextTargetNodeId;
      onConnectionTargetChangeRef.current(nextTargetNodeId);
    },
    end(event) {
      if (!active) return;
      const droppedNodeId = findTargetId(event);
      if (droppedNodeId !== null) {
        onConnectNodesRef.current(sourceNodeId, droppedNodeId);
      }
      finish();
    },
    cancel() {
      finish();
    },
  };
}
