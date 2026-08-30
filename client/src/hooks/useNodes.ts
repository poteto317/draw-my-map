import { useState, useCallback } from "react";
import { RECT_WIDTH, RECT_HEIGHT } from "@/config/shapes";
import type { Node } from "@/types/node";

type UseNodesReturn = {
  nodes: Node[];
  selectedNodeId: number | null;
  addNode: (x: number, y: number) => void;
  selectNode: (id: number | null) => void;
  updateNodeLabel: (id: number, label: string) => void;
  moveNode: (id: number, x: number, y: number) => void;
  deleteNode: (id: number) => void;
};

export function useNodes(): UseNodesReturn {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);

  const addNode = (x: number, y: number) => {
    setNodes((prev) => [
      ...prev,
      {
        id: Date.now(),
        x: x - RECT_WIDTH / 2,
        y: y - RECT_HEIGHT / 2,
        width: RECT_WIDTH,
        height: RECT_HEIGHT,
        label: "",
      },
    ]);
  };

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

  return { nodes, selectedNodeId, addNode, selectNode, updateNodeLabel, moveNode, deleteNode };
}
