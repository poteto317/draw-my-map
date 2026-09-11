"use client";

import { useEffect } from "react";
import type { ScreenSize } from "@/components/map/mapViewport";
import {
  isViewportFocusShortcut,
  resolveViewportFocusRequest,
} from "@/components/map/viewportFocusShortcut";
import type { Node } from "@/types/node";

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
      if (!isViewportFocusShortcut(event)) return;
      const request = resolveViewportFocusRequest({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        target: event.target,
        nodes,
        selectedNodeId,
        isEditing,
        hasActiveGesture: hasActiveGesture(),
        screen,
      });
      if (!request) return;
      event.preventDefault();
      onFocusNode(request.node, request.screen);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nodes, selectedNodeId, isEditing, screen, hasActiveGesture, onFocusNode]);
}
