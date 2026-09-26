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
  moveNode: (id: number, x: number, y: number) => void;
  connectNodes: (parentId: number, childId: number) => boolean;
  deleteNode: (id: number) => void;
  setLayoutMode: (mode: NodeLayoutMode) => void;
  replaceMap: (state: NodeMapState) => void;
};

export function useNodes(): UseNodesReturn {
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
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
  } = useNodeLayoutState();

  const replaceMap = useCallback((state: NodeMapState) => {
    nodeIdAllocatorRef.current!.reset();
    replaceLayoutState(state.nodes, state.layoutMode);
    setSelectedNodeId(null);
  }, [replaceLayoutState]);

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
    applyNonStructuralChange((currentNodes) => {
      if (!currentNodes.some((node) => node.id === id)) return null;
      return currentNodes.map((node) => (
        node.id === id ? { ...node, importance } : node
      ));
    })
  ), [applyNonStructuralChange]);

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
    moveNode,
    connectNodes,
    deleteNode,
    setLayoutMode,
    replaceMap,
  };
}
