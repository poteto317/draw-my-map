"use client";

import { useLayoutEffect, useRef } from "react";

type UseHiddenNodeInteractionResetOptions = {
  selectedNodeId: number | null;
  editingNodeId: number | null;
  visibleNodeIds: ReadonlySet<number>;
  onSelectNode: (id: number | null) => void;
  cancelEditing: () => void;
  cancelActiveGesture: () => void;
};

type HiddenInteractionIds = {
  selectedNodeId: number | null;
  editingNodeId: number | null;
};

export function useHiddenNodeInteractionReset({
  selectedNodeId,
  editingNodeId,
  visibleNodeIds,
  onSelectNode,
  cancelEditing,
  cancelActiveGesture,
}: UseHiddenNodeInteractionResetOptions): void {
  const lastResetRef = useRef<HiddenInteractionIds | null>(null);

  useLayoutEffect(() => {
    const hiddenIds = {
      selectedNodeId: selectedNodeId !== null && !visibleNodeIds.has(selectedNodeId)
        ? selectedNodeId
        : null,
      editingNodeId: editingNodeId !== null && !visibleNodeIds.has(editingNodeId)
        ? editingNodeId
        : null,
    };
    if (hiddenIds.selectedNodeId === null && hiddenIds.editingNodeId === null) {
      lastResetRef.current = null;
      return;
    }
    if (
      lastResetRef.current?.selectedNodeId === hiddenIds.selectedNodeId
      && lastResetRef.current.editingNodeId === hiddenIds.editingNodeId
    ) return;

    lastResetRef.current = hiddenIds;
    onSelectNode(null);
    cancelEditing();
    cancelActiveGesture();
  }, [
    selectedNodeId,
    editingNodeId,
    visibleNodeIds,
    onSelectNode,
    cancelEditing,
    cancelActiveGesture,
  ]);
}
