import { findNodeAtPoint } from "@/components/map/mapGeometry";
import type { LatestValue, PointerGesture, PointerSample } from "@/components/map/pixi/pointerGesture";
import { canConnectNodes } from "@/domain/nodes/nodeTree";
import type { Node } from "@/types/node";

type NodeConnectionGestureOptions = {
  sourceNodeId: number;
  nodesRef: LatestValue<readonly Node[]>;
  visibleNodeIdsRef?: LatestValue<ReadonlySet<number>>;
  onConnectNodesRef: LatestValue<(parentId: number, childId: number) => void>;
  onConnectionTargetChangeRef: LatestValue<(id: number | null) => void>;
};

export function createNodeConnectionGesture({
  sourceNodeId,
  nodesRef,
  visibleNodeIdsRef,
  onConnectNodesRef,
  onConnectionTargetChangeRef,
}: NodeConnectionGestureOptions): PointerGesture | null {
  if (!nodesRef.current.some((node) => node.id === sourceNodeId)) return null;

  let active = true;
  let targetNodeId: number | null = null;

  const findTargetId = (sample: PointerSample) => {
    const target = findNodeAtPoint(
      visibleNodeIdsRef === undefined
        ? nodesRef.current
        : nodesRef.current.filter((node) => visibleNodeIdsRef.current.has(node.id)),
      sample.world,
    );

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
    move(sample) {
      if (!active) return;
      const nextTargetNodeId = findTargetId(sample);
      if (nextTargetNodeId === targetNodeId) return;
      targetNodeId = nextTargetNodeId;
      onConnectionTargetChangeRef.current(nextTargetNodeId);
    },
    end(sample) {
      if (!active) return;
      const droppedNodeId = findTargetId(sample);
      finish();
      if (droppedNodeId !== null) {
        onConnectNodesRef.current(sourceNodeId, droppedNodeId);
      }
    },
    cancel() {
      finish();
    },
    activeNodeIds: () => targetNodeId === null ? [sourceNodeId] : [sourceNodeId, targetNodeId],
  };
}
