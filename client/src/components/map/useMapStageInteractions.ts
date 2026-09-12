import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Viewport } from "@/components/map/mapViewport";
import { createStageInteractions } from "@/components/map/pixi/stageInteractions";
import type { LatestValue } from "@/components/map/pixi/pointerGesture";
import type { PixiRuntime } from "@/components/map/pixi/pixiTypes";
import type { Node } from "@/types/node";

type UseMapStageInteractionsOptions = {
  runtime: PixiRuntime | null;
  nodes: readonly Node[];
  viewportRef: LatestValue<Viewport>;
  onViewportChange: (viewport: Viewport) => void;
  onSelectNode: (id: number | null) => void;
  onMoveNode: (id: number, x: number, y: number) => void;
  onConnectNodes: (parentId: number, childId: number) => void;
};

export function useMapStageInteractions({
  runtime,
  nodes,
  viewportRef,
  onViewportChange,
  onSelectNode,
  onMoveNode,
  onConnectNodes,
}: UseMapStageInteractionsOptions) {
  const [connectionTargetNodeId, setConnectionTargetNodeId] = useState<number | null>(null);
  const nodesRef = useRef<readonly Node[]>(nodes);
  const onSelectNodeRef = useRef(onSelectNode);
  const onMoveNodeRef = useRef(onMoveNode);
  const onConnectNodesRef = useRef(onConnectNodes);
  const onConnectionTargetChangeRef = useRef(setConnectionTargetNodeId);
  const onViewportChangeRef = useRef(onViewportChange);

  useLayoutEffect(() => {
    nodesRef.current = nodes;
    onSelectNodeRef.current = onSelectNode;
    onMoveNodeRef.current = onMoveNode;
    onConnectNodesRef.current = onConnectNodes;
    onViewportChangeRef.current = onViewportChange;
  }, [nodes, onSelectNode, onMoveNode, onConnectNodes, onViewportChange]);

  const interactionsRef = useRef<ReturnType<typeof createStageInteractions> | null>(null);
  interactionsRef.current ??= createStageInteractions({
    nodesRef,
    viewportRef,
    onSelectNodeRef,
    onMoveNodeRef,
    onConnectNodesRef,
    onConnectionTargetChangeRef,
    onViewportChangeRef,
  });
  const interactions = interactionsRef.current;

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
