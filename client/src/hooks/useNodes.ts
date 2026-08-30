import { useState, useCallback } from "react";
import {
  RECT_WIDTH,
  RECT_HEIGHT,
  CHILD_HORIZONTAL_GAP,
  SIBLING_VERTICAL_GAP,
} from "@/config/shapes";
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

  const addNode = (x: number, y: number) => {
    const id = Date.now();
    setNodes((prev) => [
      ...prev,
      {
        id,
        parentId: null,
        x: x - RECT_WIDTH / 2,
        y: y - RECT_HEIGHT / 2,
        width: RECT_WIDTH,
        height: RECT_HEIGHT,
        label: "",
      },
    ]);
    return id;
  };

  const addChildNode = useCallback((parentId: number) => {
    const parent = nodes.find((node) => node.id === parentId);
    if (!parent) return null;

    const siblings = nodes.filter((node) => node.parentId === parentId);
    const id = Date.now();
    const y = siblings.length === 0
      ? parent.y
      : Math.max(...siblings.map((node) => node.y + node.height))
        + SIBLING_VERTICAL_GAP;

    setNodes((prev) => [
      ...prev,
      {
        id,
        parentId,
        x: parent.x + parent.width + CHILD_HORIZONTAL_GAP,
        y,
        width: RECT_WIDTH,
        height: RECT_HEIGHT,
        label: "",
      },
    ]);
    setSelectedNodeId(id);
    return id;
  }, [nodes]);

  const addSiblingNode = useCallback((nodeId: number) => {
    const source = nodes.find((node) => node.id === nodeId);
    if (!source) return null;

    const siblings = nodes.filter((node) => node.parentId === source.parentId);
    const id = Date.now();
    const y = Math.max(...siblings.map((node) => node.y + node.height))
      + SIBLING_VERTICAL_GAP;

    setNodes((prev) => [
      ...prev,
      {
        id,
        parentId: source.parentId,
        x: source.x,
        y,
        width: RECT_WIDTH,
        height: RECT_HEIGHT,
        label: "",
      },
    ]);
    setSelectedNodeId(id);
    return id;
  }, [nodes]);

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
    setNodes((prev) => prev.filter((node) => node.id !== id));
    setSelectedNodeId((prev) => (prev === id ? null : prev));
  }, []);

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
