import { useCallback, useRef, useState } from "react";
import { layoutNodeForest } from "@/domain/nodes/nodeAutoLayout";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";

type UseNodeLayoutStateReturn = {
  nodes: Node[];
  layoutMode: NodeLayoutMode;
  applyNonStructuralChange: (update: NodeChange) => boolean;
  applyManualMove: (update: NodeChange) => boolean;
  applyTreeChange: (update: NodeChange) => boolean;
  setLayoutMode: (mode: NodeLayoutMode) => void;
  replaceLayoutState: (nodes: Node[], mode: NodeLayoutMode) => void;
};

type NodeChange = (currentNodes: readonly Node[]) => Node[] | null;

export function useNodeLayoutState(): UseNodeLayoutStateReturn {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [layoutMode, setLayoutModeState] = useState<NodeLayoutMode>("manual");
  const nodesRef = useRef<readonly Node[]>(nodes);
  const layoutModeRef = useRef<NodeLayoutMode>(layoutMode);

  const commitNodes = useCallback((nextNodes: Node[]) => {
    nodesRef.current = nextNodes;
    setNodes(nextNodes);
  }, []);

  const replaceLayoutState = useCallback((nextNodes: Node[], mode: NodeLayoutMode) => {
    nodesRef.current = nextNodes;
    layoutModeRef.current = mode;
    setNodes(nextNodes);
    setLayoutModeState(mode);
  }, []);

  const applyNonStructuralChange = useCallback((update: NodeChange): boolean => {
    const nextNodes = update(nodesRef.current);
    if (!nextNodes) return false;

    commitNodes(nextNodes);
    return true;
  }, [commitNodes]);

  const applyManualMove = useCallback((update: NodeChange): boolean => {
    if (layoutModeRef.current === "auto") return false;
    return applyNonStructuralChange(update);
  }, [applyNonStructuralChange]);

  const applyTreeChange = useCallback((update: NodeChange): boolean => {
    const candidateNodes = update(nodesRef.current);
    if (!candidateNodes) return false;

    const nextNodes = layoutModeRef.current === "auto"
      ? layoutNodeForest(candidateNodes)
      : candidateNodes;
    if (!nextNodes) return false;

    commitNodes(nextNodes);
    return true;
  }, [commitNodes]);

  const setLayoutMode = useCallback((mode: NodeLayoutMode) => {
    if (mode === layoutModeRef.current) return;

    if (mode === "auto") {
      const nextNodes = layoutNodeForest(nodesRef.current);
      if (!nextNodes) return;
      commitNodes(nextNodes);
    }

    layoutModeRef.current = mode;
    setLayoutModeState(mode);
  }, [commitNodes]);

  return {
    nodes,
    layoutMode,
    applyNonStructuralChange,
    applyManualMove,
    applyTreeChange,
    setLayoutMode,
    replaceLayoutState,
  };
}
