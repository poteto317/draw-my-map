"use client";

import { useLayoutEffect, useRef } from "react";
import type { Viewport } from "@/components/map/mapViewport";
import type { MapHistoryGroupLease } from "@/domain/history/mapHistory";
import type { SiblingReorderRequest } from "@/domain/nodes/nodeSiblingOrder";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";

type UseStageInteractionValuesOptions = {
  nodes: readonly Node[];
  visibleNodeIds?: ReadonlySet<number>;
  onViewportChange: (viewport: Viewport) => void;
  onSelectNode: (id: number | null) => void;
  onMoveNode: (id: number, x: number, y: number) => void;
  onBeginNodeMove: () => MapHistoryGroupLease;
  onConnectNodes: (parentId: number, childId: number) => void;
  layoutMode: NodeLayoutMode;
  onReorderSibling: (nodeId: number, request: SiblingReorderRequest) => void;
};

export function resolveEffectiveVisibleNodeIds(
  nodes: readonly Node[],
  visibleNodeIds: ReadonlySet<number> | undefined,
): ReadonlySet<number> {
  return visibleNodeIds ?? new Set(nodes.map((node) => node.id));
}

export function useStageInteractionValues({
  nodes,
  visibleNodeIds,
  onViewportChange,
  onSelectNode,
  onMoveNode,
  onBeginNodeMove,
  onConnectNodes,
  layoutMode,
  onReorderSibling,
}: UseStageInteractionValuesOptions) {
  const nodesRef = useRef<readonly Node[]>(nodes);
  const visibleNodeIdsRef = useRef<ReadonlySet<number>>(
    resolveEffectiveVisibleNodeIds(nodes, visibleNodeIds),
  );
  const onViewportChangeRef = useRef(onViewportChange);
  const onSelectNodeRef = useRef(onSelectNode);
  const onMoveNodeRef = useRef(onMoveNode);
  const onBeginNodeMoveRef = useRef(onBeginNodeMove);
  const onConnectNodesRef = useRef(onConnectNodes);
  const layoutModeRef = useRef(layoutMode);
  const onReorderSiblingRef = useRef(onReorderSibling);

  useLayoutEffect(() => {
    nodesRef.current = nodes;
    visibleNodeIdsRef.current = resolveEffectiveVisibleNodeIds(nodes, visibleNodeIds);
    onViewportChangeRef.current = onViewportChange;
    onSelectNodeRef.current = onSelectNode;
    onMoveNodeRef.current = onMoveNode;
    onBeginNodeMoveRef.current = onBeginNodeMove;
    onConnectNodesRef.current = onConnectNodes;
    layoutModeRef.current = layoutMode;
    onReorderSiblingRef.current = onReorderSibling;
  }, [
    nodes,
    visibleNodeIds,
    onViewportChange,
    onSelectNode,
    onMoveNode,
    onBeginNodeMove,
    onConnectNodes,
    layoutMode,
    onReorderSibling,
  ]);

  return {
    nodesRef,
    visibleNodeIdsRef,
    onViewportChangeRef,
    onSelectNodeRef,
    onMoveNodeRef,
    onBeginNodeMoveRef,
    onConnectNodesRef,
    layoutModeRef,
    onReorderSiblingRef,
  };
}
