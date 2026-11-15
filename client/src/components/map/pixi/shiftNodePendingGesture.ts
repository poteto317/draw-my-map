import { createDragActivation } from "@/components/map/pixi/dragActivation";
import { createNodeConnectionGesture } from "@/components/map/pixi/nodeConnectionGesture";
import type { LatestValue, PointerGesture, PointerSample } from "@/components/map/pixi/pointerGesture";
import { hasFinitePointerCoordinates } from "@/components/map/pixi/pointerSample";
import type { Node } from "@/types/node";

export function resolveVisibleOrderedIds(
  nodes: readonly Node[],
  visibleNodeIds: ReadonlySet<number> | undefined,
): readonly number[] {
  if (visibleNodeIds === undefined) return nodes.map((node) => node.id);
  return nodes.filter((node) => visibleNodeIds.has(node.id)).map((node) => node.id);
}

type ShiftNodePendingGestureOptions = {
  nodeId: number;
  startSample: PointerSample;
  nodesRef: LatestValue<readonly Node[]>;
  visibleNodeIdsRef?: LatestValue<ReadonlySet<number>>;
  onSelectNodeRef: LatestValue<(id: number | null) => void>;
  onSelectNodeRangeRef?: LatestValue<(targetId: number, visibleOrdered: readonly number[]) => void>;
  onConnectNodesRef: LatestValue<(parentId: number, childId: number) => void>;
  onConnectionTargetChangeRef: LatestValue<(id: number | null) => void>;
  dragThreshold: number;
};

/** Shift+ノード: しきい値超で接続、未 activated の終端で範囲選択 */
export function createShiftNodePendingGesture({
  nodeId,
  startSample,
  nodesRef,
  visibleNodeIdsRef,
  onSelectNodeRef,
  onSelectNodeRangeRef,
  onConnectNodesRef,
  onConnectionTargetChangeRef,
  dragThreshold,
}: ShiftNodePendingGestureOptions): PointerGesture | null {
  if (!hasFinitePointerCoordinates(startSample)) return null;
  const dragActivation = createDragActivation(startSample.screen, dragThreshold);
  let activated = false;
  let connection: PointerGesture | null = null;
  let finished = false;

  return {
    move(sample) {
      if (finished) return;
      if (connection) {
        connection.move(sample);
        return;
      }
      if (!hasFinitePointerCoordinates(sample)) return;
      if (!dragActivation.update(sample.screen)) return;
      activated = true;
      onSelectNodeRef.current(nodeId);
      connection = createNodeConnectionGesture({
        sourceNodeId: nodeId,
        nodesRef,
        visibleNodeIdsRef,
        onConnectNodesRef,
        onConnectionTargetChangeRef,
      });
      connection?.move(sample);
    },
    end(sample) {
      if (finished) return;
      finished = true;
      if (connection) {
        connection.end(sample);
        return;
      }
      onSelectNodeRangeRef?.current(
        nodeId,
        resolveVisibleOrderedIds(nodesRef.current, visibleNodeIdsRef?.current),
      );
    },
    cancel() {
      if (finished) return;
      finished = true;
      connection?.cancel();
    },
    isActivated: () => activated,
    activeNodeIds: () => connection?.activeNodeIds?.() ?? [nodeId],
  };
}
