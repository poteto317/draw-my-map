"use client";

import { useCallback, useState } from "react";
import type { Node } from "@/types/node";

export function useNodeEditing(nodes: Node[], onUpdateLabel: (id: number, label: string) => void) {
  const [editingNodeId, setEditingNodeId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");

  const startEditing = useCallback((nodeId: number, initialText?: string) => {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (initialText === undefined && !node) return;

    setEditingNodeId(nodeId);
    setEditingText(initialText ?? node!.label);
  }, [nodes]);

  const commitEditing = useCallback(() => {
    if (editingNodeId !== null) {
      onUpdateLabel(editingNodeId, editingText);
    }
    setEditingNodeId(null);
    setEditingText("");
  }, [editingNodeId, editingText, onUpdateLabel]);

  const cancelEditing = useCallback(() => {
    setEditingNodeId(null);
    setEditingText("");
  }, []);

  const editingNode = editingNodeId === null
    ? null
    : nodes.find((node) => node.id === editingNodeId) ?? null;

  return {
    editingNodeId,
    editingNode,
    editingText,
    setEditingText,
    startEditing,
    commitEditing,
    cancelEditing,
  };
}
