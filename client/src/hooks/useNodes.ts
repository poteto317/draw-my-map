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
import { createMonotonicIdGenerator } from "@/domain/nodes/nodeIdGenerator";
import { useNodeLayoutState } from "@/hooks/useNodeLayoutState";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import type { MapDocumentV1 } from "@/types/mapDocument";

type UseNodesReturn = {
  nodes: Node[];
  selectedNodeId: number | null;
  layoutMode: NodeLayoutMode;
  addNode: (x: number, y: number) => number;
  addChildNode: (parentId: number) => number | null;
  addSiblingNode: (nodeId: number) => number | null;
  selectNode: (id: number | null) => void;
  updateNodeLabel: (id: number, label: string) => void;
  moveNode: (id: number, x: number, y: number) => void;
  connectNodes: (parentId: number, childId: number) => boolean;
  deleteNode: (id: number) => void;
  setLayoutMode: (mode: NodeLayoutMode) => void;
  replaceMap: (document: MapDocumentV1) => void;
};

export function useNodes(): UseNodesReturn {
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const generateNodeIdRef = useRef<(() => number) | null>(null);
  generateNodeIdRef.current ??= createMonotonicIdGenerator();
  const {
    nodes,
    layoutMode,
    applyNonStructuralChange,
    applyManualMove,
    applyTreeChange,
    setLayoutMode,
    replaceLayoutState,
  } = useNodeLayoutState();

  const generateAvailableNodeId = useCallback((currentNodes: readonly Node[]) => {
    const occupiedIds = new Set(currentNodes.map((node) => node.id));
    const generateNodeId = generateNodeIdRef.current!;
    let id = generateNodeId();
    while (occupiedIds.has(id)) id = generateNodeId();
    return id;
  }, []);

  const replaceMap = useCallback((document: MapDocumentV1) => {
    generateNodeIdRef.current = createMonotonicIdGenerator();
    replaceLayoutState(document.nodes, document.layoutMode);
    setSelectedNodeId(null);
  }, [replaceLayoutState]);

  const addNode = useCallback((x: number, y: number) => {
    let id!: number;
    applyTreeChange((currentNodes) => {
      id = generateAvailableNodeId(currentNodes);
      return [...currentNodes, createRootNode(id, x, y)];
    });
    return id;
  }, [applyTreeChange, generateAvailableNodeId]);

  const addChildNode = useCallback((parentId: number) => {
    let createdId: number | null = null;
    const applied = applyTreeChange((currentNodes) => {
      if (!currentNodes.some((node) => node.id === parentId)) return null;
      const id = generateAvailableNodeId(currentNodes);
      const child = createChildNode(currentNodes, parentId, id);
      if (!child) return null;

      createdId = id;
      return [...currentNodes, child];
    });
    if (!applied || createdId === null) return null;

    setSelectedNodeId(createdId);
    return createdId;
  }, [applyTreeChange, generateAvailableNodeId]);

  const addSiblingNode = useCallback((nodeId: number) => {
    let createdId: number | null = null;
    const applied = applyTreeChange((currentNodes) => {
      if (!currentNodes.some((node) => node.id === nodeId)) return null;
      const id = generateAvailableNodeId(currentNodes);
      const sibling = createSiblingNode(currentNodes, nodeId, id);
      if (!sibling) return null;

      createdId = id;
      return [...currentNodes, sibling];
    });
    if (!applied || createdId === null) return null;

    setSelectedNodeId(createdId);
    return createdId;
  }, [applyTreeChange, generateAvailableNodeId]);

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
    moveNode,
    connectNodes,
    deleteNode,
    setLayoutMode,
    replaceMap,
  };
}
