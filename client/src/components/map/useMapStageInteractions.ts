import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createStageInteractions } from "@/components/map/pixi/stageInteractions";
import type { PixiRuntime } from "@/components/map/pixi/pixiTypes";
import type { Node } from "@/types/node";

type UseMapStageInteractionsOptions = {
  runtime: PixiRuntime | null;
  nodes: readonly Node[];
  onSelectNode: (id: number | null) => void;
  onMoveNode: (id: number, x: number, y: number) => void;
  onConnectNodes: (parentId: number, childId: number) => boolean;
};

export function useMapStageInteractions({
  runtime,
  nodes,
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

  useLayoutEffect(() => {
    nodesRef.current = nodes;
    onSelectNodeRef.current = onSelectNode;
    onMoveNodeRef.current = onMoveNode;
    onConnectNodesRef.current = onConnectNodes;
  }, [nodes, onSelectNode, onMoveNode, onConnectNodes]);

  const interactionsRef = useRef<ReturnType<typeof createStageInteractions> | null>(null);
  interactionsRef.current ??= createStageInteractions({
    nodesRef,
    onSelectNodeRef,
    onMoveNodeRef,
    onConnectNodesRef,
    onConnectionTargetChangeRef,
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
    onNodePointerDown: interactions.handleNodePointerDown,
  };
}
