import { useState, useCallback, useRef } from "react";
import {
  createChildNode,
  createRootNode,
  createSiblingNode,
} from "@/domain/nodes/nodePlacement";
import { collectSubtreeIds } from "@/domain/nodes/nodeTree";
import { createMonotonicIdGenerator } from "@/domain/nodes/nodeIdGenerator";
import type { Node } from "@/types/node";

type UseNodesReturn = {
  nodes: Node[];
  selectedNodeId: number | null;
  addNode: (x: number, y: number) => number;
  addChildNode: (parentId: number) => number | null;
  addSiblingNode: (nodeId: number) => number | null;
  selectNode: (id: number | null) => void;
  updateNodeLabel: (id: number, label: string) => void;
  moveNode: (id: number, x: number, y: number) => void;
  deleteNode: (id: number) => void;
};

export function useNodes(): UseNodesReturn {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const nodesRef = useRef<readonly Node[]>(nodes);
  const generateNodeIdRef = useRef<(() => number) | null>(null);
  generateNodeIdRef.current ??= createMonotonicIdGenerator();
  const generateNodeId = generateNodeIdRef.current;

  const updateNodes = useCallback((update: (current: readonly Node[]) => Node[]) => {
    const nextNodes = update(nodesRef.current);
    nodesRef.current = nextNodes;
    setNodes(nextNodes);
  }, []);

  const addNode = (x: number, y: number) => {
    const id = generateNodeId();
    updateNodes((current) => [...current, createRootNode(id, x, y)]);
    return id;
  };

  const addChildNode = useCallback((parentId: number) => {
    const currentNodes = nodesRef.current;
    if (!currentNodes.some((node) => node.id === parentId)) return null;
    const id = generateNodeId();
    const child = createChildNode(currentNodes, parentId, id);
    if (!child) return null;

    updateNodes((current) => [...current, child]);
    setSelectedNodeId(id);
    return id;
  }, [generateNodeId, updateNodes]);

  const addSiblingNode = useCallback((nodeId: number) => {
    const currentNodes = nodesRef.current;
    if (!currentNodes.some((node) => node.id === nodeId)) return null;
    const id = generateNodeId();
    const sibling = createSiblingNode(currentNodes, nodeId, id);
    if (!sibling) return null;

    updateNodes((current) => [...current, sibling]);
    setSelectedNodeId(id);
    return id;
  }, [generateNodeId, updateNodes]);

  const selectNode = (id: number | null) => {
    setSelectedNodeId(id);
  };

  const updateNodeLabel = useCallback((id: number, label: string) => {
    updateNodes((current) =>
      current.map((node) => (node.id === id ? { ...node, label } : node)),
    );
  }, [updateNodes]);

  const moveNode = useCallback((id: number, x: number, y: number) => {
    updateNodes((current) =>
      current.map((node) => (node.id === id ? { ...node, x, y } : node)),
    );
  }, [updateNodes]);

  const deleteNode = useCallback((id: number) => {
    const subtreeIds = collectSubtreeIds(nodesRef.current, id);
    updateNodes((current) => current.filter((node) => !subtreeIds.has(node.id)));
    setSelectedNodeId((prev) => (
      prev !== null && subtreeIds.has(prev) ? null : prev
    ));
  }, [updateNodes]);

  return {
    nodes,
    selectedNodeId,
    addNode,
    addChildNode,
    addSiblingNode,
    selectNode,
    updateNodeLabel,
    moveNode,
    deleteNode,
  };
}
