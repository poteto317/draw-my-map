"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

type NodeKeyboardShortcutOptions = {
  selectedNodeId: number | null;
  isEditing: boolean;
  onAddChildNode: (parentId: number) => number | null;
  onAddSiblingNode: (nodeId: number) => number | null;
  onDeleteNode: (nodeId: number) => void;
  onStartEditing: (nodeId: number, initialText: string) => void;
  enabled: boolean;
};

const isInteractiveTarget = (target: EventTarget | null): boolean => (
  target instanceof HTMLElement
  && Boolean(target.closest("button, input, textarea, select, a[href], [contenteditable]"))
);

export function useNodeKeyboardShortcuts({
  selectedNodeId,
  isEditing,
  onAddChildNode,
  onAddSiblingNode,
  onDeleteNode,
  onStartEditing,
  enabled,
}: NodeKeyboardShortcutOptions): void {
  // enabled の切り替えで window の登録をやり直さないよう、ref から読む
  const enabledRef = useRef(enabled);
  useLayoutEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!enabledRef.current) return;
      if (isEditing || selectedNodeId === null || isInteractiveTarget(event.target)) return;

      let createdId: number | null = null;
      if (event.key === "Tab") {
        event.preventDefault();
        createdId = onAddChildNode(selectedNodeId);
      } else if (event.key === "Enter") {
        event.preventDefault();
        createdId = onAddSiblingNode(selectedNodeId);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        onDeleteNode(selectedNodeId);
      }

      if (createdId !== null) onStartEditing(createdId, "");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedNodeId, isEditing, onAddChildNode, onAddSiblingNode, onDeleteNode, onStartEditing]);
}
