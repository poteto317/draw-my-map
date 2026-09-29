import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Viewport } from "@/components/map/mapViewport";
import { createStageInteractions } from "@/components/map/pixi/stageInteractions";
import type { LatestValue } from "@/components/map/pixi/pointerGesture";
import type { PixiRuntime } from "@/components/map/pixi/pixiTypes";
import { useStageInteractionValues } from "@/components/map/useStageInteractionValues";
import type { Node } from "@/types/node";

type UseMapStageInteractionsOptions = {
  runtime: PixiRuntime | null;
  nodes: readonly Node[];
  visibleNodeIds?: ReadonlySet<number>;
  viewportRef: LatestValue<Viewport>;
  onViewportChange: (viewport: Viewport) => void;
  onSelectNode: (id: number | null) => void;
  onMoveNode: (id: number, x: number, y: number) => void;
  onConnectNodes: (parentId: number, childId: number) => void;
};

export function useMapStageInteractions({
  runtime,
  nodes,
  visibleNodeIds,
  viewportRef,
  onViewportChange,
  onSelectNode,
  onMoveNode,
  onConnectNodes,
}: UseMapStageInteractionsOptions) {
  const [connectionTargetNodeId, setConnectionTargetNodeId] = useState<number | null>(null);
  const onConnectionTargetChangeRef = useRef(setConnectionTargetNodeId);
  const {
    nodesRef,
    visibleNodeIdsRef,
    onSelectNodeRef,
    onMoveNodeRef,
    onConnectNodesRef,
    onViewportChangeRef,
  } = useStageInteractionValues({
    nodes,
    visibleNodeIds,
    onViewportChange,
    onSelectNode,
    onMoveNode,
    onConnectNodes,
  });

  const interactionsRef = useRef<ReturnType<typeof createStageInteractions> | null>(null);
  interactionsRef.current ??= createStageInteractions({
    nodesRef,
    visibleNodeIdsRef,
    viewportRef,
    onSelectNodeRef,
    onMoveNodeRef,
    onConnectNodesRef,
    onConnectionTargetChangeRef,
    onViewportChangeRef,
  });
  const interactions = interactionsRef.current;

  useLayoutEffect(() => {
    if (interactions.activeNodeIds().some((nodeId) => !visibleNodeIdsRef.current.has(nodeId))) {
      interactions.cancelActiveGesture();
    }
  }, [interactions, nodes, visibleNodeIds, visibleNodeIdsRef]);

  useEffect(() => {
    if (!runtime) return;

    runtime.app.stage.eventMode = "static";
    runtime.app.stage.hitArea = runtime.app.screen;
    return interactions.bind(runtime.app.stage);
  }, [runtime, interactions]);

  return {
    connectionTargetNodeId,
    createNodePointerDownHandler: interactions.createNodePointerDownHandler,
    cancelActiveGesture: interactions.cancelActiveGesture,
    hasActiveGesture: interactions.hasActiveGesture,
  };
}
