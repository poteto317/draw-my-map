import { useState, useCallback, useRef } from "react";
import {
  createChildNode,
  createRootNode,
  createSiblingNode,
} from "@/domain/nodes/nodePlacement";
import {
  collectSubtreeIds,
  connectNodeTree,
  moveNodeSubtree,
} from "@/domain/nodes/nodeTree";
import {
  createNodeIdAllocator,
  type NodeIdAllocator,
} from "@/domain/nodes/nodeIdAllocator";
import { replaceNodeImportance } from "@/domain/nodes/nodeImportanceUpdate";
import { clearNodeIllustration, replaceNodeIllustration } from "@/domain/nodes/nodeIllustrationUpdate";
import type { MapHistoryGroupLease } from "@/domain/history/mapHistory";
import { useNodeLayoutState } from "@/hooks/useNodeLayoutState";
import type { Node } from "@/types/node";
import type { NodeImportance } from "@/types/nodeImportance";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import type { NodeMapState } from "@/types/nodeMapState";

type UseNodesReturn = {
  nodes: Node[];
  selectedNodeId: number | null;
  layoutMode: NodeLayoutMode;
  addNode: (x: number, y: number) => number;
  addChildNode: (parentId: number) => number | null;
  addSiblingNode: (nodeId: number) => number | null;
  selectNode: (id: number | null) => void;
  updateNodeLabel: (id: number, label: string) => void;
  updateNodeImportance: (id: number, importance: NodeImportance) => boolean;
  attachIllustration: (id: number, dataUrl: string) => boolean;
  removeIllustration: (id: number) => boolean;
  moveNode: (id: number, x: number, y: number) => void;
  connectNodes: (parentId: number, childId: number) => boolean;
  deleteNode: (id: number) => void;
  setLayoutMode: (mode: NodeLayoutMode) => void;
  replaceMap: (state: NodeMapState) => void;
  // 成功したUndo／RedoとreplaceMapで増える。編集・ジェスチャー・生成結果の失効に使う
  documentRevision: number;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => boolean;
  redo: () => boolean;
  beginMoveHistory: () => MapHistoryGroupLease;
};

export function useNodes(): UseNodesReturn {
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [documentRevision, setDocumentRevision] = useState(0);
  const nodeIdAllocatorRef = useRef<NodeIdAllocator | null>(null);
  nodeIdAllocatorRef.current ??= createNodeIdAllocator();
  const {
    nodes,
    layoutMode,
    applyNonStructuralChange,
    applyManualMove,
    applyTreeChange,
    setLayoutMode,
    replaceLayoutState,
    canUndo,
    canRedo,
    undo: undoLayout,
    redo: redoLayout,
    beginMoveHistory,
  } = useNodeLayoutState();

  // 復元したマップでは以前の選択と編集対象が無効になるため、選択を外して版を進める
  const markDocumentRestored = useCallback(() => {
    setSelectedNodeId(null);
    setDocumentRevision((revision) => revision + 1);
  }, []);

  const replaceMap = useCallback((state: NodeMapState) => {
    nodeIdAllocatorRef.current!.reset();
    replaceLayoutState(state.nodes, state.layoutMode);
    markDocumentRestored();
  }, [replaceLayoutState, markDocumentRestored]);

  // ID allocatorはresetしない。Undoで消えたノードのIDも以後の追加で再利用しない
  const undo = useCallback(() => {
    const restored = undoLayout();
    if (restored) markDocumentRestored();
    return restored;
  }, [undoLayout, markDocumentRestored]);

  const redo = useCallback(() => {
    const restored = redoLayout();
    if (restored) markDocumentRestored();
    return restored;
  }, [redoLayout, markDocumentRestored]);

  const addNode = useCallback((x: number, y: number) => {
    let id!: number;
    applyTreeChange((currentNodes) => {
      id = nodeIdAllocatorRef.current!.nextAvailableId(currentNodes);
      return [...currentNodes, createRootNode(id, x, y)];
    });
    return id;
  }, [applyTreeChange]);

  const addChildNode = useCallback((parentId: number) => {
    let createdId: number | null = null;
    const applied = applyTreeChange((currentNodes) => {
      if (!currentNodes.some((node) => node.id === parentId)) return null;
      const id = nodeIdAllocatorRef.current!.nextAvailableId(currentNodes);
      const child = createChildNode(currentNodes, parentId, id);
      if (!child) return null;

      createdId = id;
      return [...currentNodes, child];
    });
    if (!applied || createdId === null) return null;

    setSelectedNodeId(createdId);
    return createdId;
  }, [applyTreeChange]);

  const addSiblingNode = useCallback((nodeId: number) => {
    let createdId: number | null = null;
    const applied = applyTreeChange((currentNodes) => {
      if (!currentNodes.some((node) => node.id === nodeId)) return null;
      const id = nodeIdAllocatorRef.current!.nextAvailableId(currentNodes);
      const sibling = createSiblingNode(currentNodes, nodeId, id);
      if (!sibling) return null;

      createdId = id;
      return [...currentNodes, sibling];
    });
    if (!applied || createdId === null) return null;

    setSelectedNodeId(createdId);
    return createdId;
  }, [applyTreeChange]);

  const selectNode = useCallback((id: number | null) => {
    setSelectedNodeId(id);
  }, []);

  const updateNodeLabel = useCallback((id: number, label: string) => {
    applyNonStructuralChange((currentNodes) => (
      currentNodes.map((node) => (
        node.id === id ? { ...node, label } : node
      ))
    ));
  }, [applyNonStructuralChange]);

  const updateNodeImportance = useCallback((id: number, importance: NodeImportance) => (
    applyNonStructuralChange((currentNodes) => (
      replaceNodeImportance(currentNodes, id, importance)
    ))
  ), [applyNonStructuralChange]);

  const attachIllustration = useCallback((id: number, dataUrl: string) => (
    applyTreeChange((currentNodes) => replaceNodeIllustration(currentNodes, id, dataUrl))
  ), [applyTreeChange]);

  const removeIllustration = useCallback((id: number) => (
    applyTreeChange((currentNodes) => clearNodeIllustration(currentNodes, id))
  ), [applyTreeChange]);

  const moveNode = useCallback((id: number, x: number, y: number) => {
    applyManualMove((currentNodes) => (
      moveNodeSubtree(currentNodes, id, x, y)
    ));
  }, [applyManualMove]);

  const connectNodes = useCallback((parentId: number, childId: number) => {
    const applied = applyTreeChange((currentNodes) => (
      connectNodeTree(currentNodes, parentId, childId)
    ));
    if (!applied) return false;

    setSelectedNodeId(childId);
    return true;
  }, [applyTreeChange]);

  const deleteNode = useCallback((id: number) => {
    let subtreeIds = new Set<number>();
    const applied = applyTreeChange((currentNodes) => {
      subtreeIds = collectSubtreeIds(currentNodes, id);
      return currentNodes.filter((node) => !subtreeIds.has(node.id));
    });
    if (!applied) return;

    const deletedIds = subtreeIds;
    setSelectedNodeId((prev) => (
      prev !== null && deletedIds.has(prev) ? null : prev
    ));
  }, [applyTreeChange]);

  return {
    nodes,
    selectedNodeId,
    layoutMode,
    addNode,
    addChildNode,
    addSiblingNode,
    selectNode,
    updateNodeLabel,
    updateNodeImportance,
    attachIllustration,
    removeIllustration,
    moveNode,
    connectNodes,
    deleteNode,
    setLayoutMode,
    replaceMap,
    documentRevision,
    canUndo,
    canRedo,
    undo,
    redo,
    beginMoveHistory,
  };
}
