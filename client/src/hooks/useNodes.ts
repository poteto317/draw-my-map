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
  const generateNodeIdRef = useRef<(() => number) | null>(null);
  generateNodeIdRef.current ??= createMonotonicIdGenerator();
  const generateNodeId = generateNodeIdRef.current;

  const addNode = (x: number, y: number) => {
    const id = generateNodeId();
    setNodes((prev) => [...prev, createRootNode(id, x, y)]);
    return id;
  };

  const addChildNode = useCallback((parentId: number) => {
    if (!nodes.some((node) => node.id === parentId)) return null;
    const id = generateNodeId();

    setNodes((prev) => {
      const child = createChildNode(prev, parentId, id);
      return child ? [...prev, child] : prev;
    });
    setSelectedNodeId(id);
    return id;
  }, [generateNodeId, nodes]);

  const addSiblingNode = useCallback((nodeId: number) => {
    if (!nodes.some((node) => node.id === nodeId)) return null;
    const id = generateNodeId();

    setNodes((prev) => {
      const sibling = createSiblingNode(prev, nodeId, id);
      return sibling ? [...prev, sibling] : prev;
    });
    setSelectedNodeId(id);
    return id;
  }, [generateNodeId, nodes]);

  const selectNode = (id: number | null) => {
    setSelectedNodeId(id);
  };

  const updateNodeLabel = useCallback((id: number, label: string) => {
    setNodes((prev) =>
      prev.map((node) => (node.id === id ? { ...node, label } : node)),
    );
  }, []);

  const moveNode = useCallback((id: number, x: number, y: number) => {
    setNodes((prev) =>
      prev.map((node) => (node.id === id ? { ...node, x, y } : node)),
    );
  }, []);

  const deleteNode = useCallback((id: number) => {
    const subtreeIds = collectSubtreeIds(nodes, id);
    setNodes((prev) => prev.filter((node) => !subtreeIds.has(node.id)));
    setSelectedNodeId((prev) => (
      prev !== null && subtreeIds.has(prev) ? null : prev
    ));
  }, [nodes]);

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
