"use client";

import { useEffect } from "react";
import type { ScreenSize } from "@/components/map/mapViewport";
import type { Node } from "@/types/node";

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  return target.closest("input, textarea, select, [contenteditable='true']") !== null;
};

type Options = {
  nodes: readonly Node[];
  selectedNodeId: number | null;
  isEditing: boolean;
  screen: ScreenSize | null;
  hasActiveGesture: () => boolean;
  onFocusNode: (node: Node, screen: ScreenSize) => void;
};

export function useMapViewportShortcut({
  nodes,
  selectedNodeId,
  isEditing,
  screen,
  hasActiveGesture,
  onFocusNode,
}: Options): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "f"
        || isEditing
        || isEditableTarget(event.target)
        || hasActiveGesture()
        || !screen
        || selectedNodeId === null) return;

      const selected = nodes.find((node) => node.id === selectedNodeId);
      if (!selected) return;
      event.preventDefault();
      onFocusNode(selected, screen);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nodes, selectedNodeId, isEditing, screen, hasActiveGesture, onFocusNode]);
}
