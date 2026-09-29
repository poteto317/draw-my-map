"use client";

import { useLayoutEffect, useRef } from "react";
import type { Viewport } from "@/components/map/mapViewport";
import type { Node } from "@/types/node";

type UseStageInteractionValuesOptions = {
  nodes: readonly Node[];
  visibleNodeIds?: ReadonlySet<number>;
  onViewportChange: (viewport: Viewport) => void;
  onSelectNode: (id: number | null) => void;
  onMoveNode: (id: number, x: number, y: number) => void;
  onConnectNodes: (parentId: number, childId: number) => void;
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
  onConnectNodes,
}: UseStageInteractionValuesOptions) {
  const nodesRef = useRef<readonly Node[]>(nodes);
  const visibleNodeIdsRef = useRef<ReadonlySet<number>>(
    resolveEffectiveVisibleNodeIds(nodes, visibleNodeIds),
  );
  const onViewportChangeRef = useRef(onViewportChange);
  const onSelectNodeRef = useRef(onSelectNode);
  const onMoveNodeRef = useRef(onMoveNode);
  const onConnectNodesRef = useRef(onConnectNodes);

  useLayoutEffect(() => {
    nodesRef.current = nodes;
    visibleNodeIdsRef.current = resolveEffectiveVisibleNodeIds(nodes, visibleNodeIds);
    onViewportChangeRef.current = onViewportChange;
    onSelectNodeRef.current = onSelectNode;
    onMoveNodeRef.current = onMoveNode;
    onConnectNodesRef.current = onConnectNodes;
  }, [nodes, visibleNodeIds, onViewportChange, onSelectNode, onMoveNode, onConnectNodes]);

  return {
    nodesRef,
    visibleNodeIdsRef,
    onViewportChangeRef,
    onSelectNodeRef,
    onMoveNodeRef,
    onConnectNodesRef,
  };
}
