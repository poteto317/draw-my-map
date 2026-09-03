import { createNodeConnectionGesture } from "@/components/map/pixi/nodeConnectionGesture";
import { createNodeMoveGesture } from "@/components/map/pixi/nodeMoveGesture";
import type { LatestValue, PointerGesture } from "@/components/map/pixi/pointerGesture";
import type { Node } from "@/types/node";
import type { Container, FederatedPointerEvent } from "pixi.js";

export type { LatestValue } from "@/components/map/pixi/pointerGesture";

type StageInteractionOptions = {
  nodesRef: LatestValue<readonly Node[]>;
  onSelectNodeRef: LatestValue<(id: number | null) => void>;
  onMoveNodeRef: LatestValue<(id: number, x: number, y: number) => void>;
  onConnectNodesRef: LatestValue<(parentId: number, childId: number) => boolean>;
  onConnectionTargetChangeRef: LatestValue<(id: number | null) => void>;
  dragThreshold?: number;
};

type InteractiveStage = Pick<Container, "on" | "off">;

export function createStageInteractions({
  nodesRef,
  onSelectNodeRef,
  onMoveNodeRef,
  onConnectNodesRef,
  onConnectionTargetChangeRef,
  dragThreshold = 4,
}: StageInteractionOptions) {
  let activeGesture: PointerGesture | null = null;

  const handleNodePointerDown = (nodeId: number, event: FederatedPointerEvent) => {
    activeGesture?.cancel();
    onSelectNodeRef.current(nodeId);
    activeGesture = event.shiftKey
      ? createNodeConnectionGesture({
        sourceNodeId: nodeId,
        nodesRef,
        onConnectNodesRef,
        onConnectionTargetChangeRef,
      })
      : createNodeMoveGesture({
        nodeId,
        startEvent: event,
        nodesRef,
        onMoveNodeRef,
        dragThreshold,
      });
  };

  const handlePointerMove = (event: FederatedPointerEvent) => {
    activeGesture?.move(event);
  };

  const bind = (stage: InteractiveStage) => {
    const handleStagePointerDown = (event: FederatedPointerEvent) => {
      if (event.target === stage) onSelectNodeRef.current(null);
    };
    const handlePointerUp = (event: FederatedPointerEvent) => {
      activeGesture?.end(event);
      activeGesture = null;
    };
    const handlePointerUpOutside = () => {
      activeGesture?.cancel();
      activeGesture = null;
    };

    stage.on("pointerdown", handleStagePointerDown);
    stage.on("pointermove", handlePointerMove);
    stage.on("pointerup", handlePointerUp);
    stage.on("pointerupoutside", handlePointerUpOutside);

    return () => {
      activeGesture?.cancel();
      activeGesture = null;
      stage.off("pointerdown", handleStagePointerDown);
      stage.off("pointermove", handlePointerMove);
      stage.off("pointerup", handlePointerUp);
      stage.off("pointerupoutside", handlePointerUpOutside);
    };
  };

  return { bind, handleNodePointerDown };
}
