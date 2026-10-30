"use client";

import { useEffect } from "react";
import type { ScreenSize } from "@/components/map/mapViewport";
import {
  isViewportFocusShortcut,
  resolveViewportFocusRequest,
} from "@/components/map/viewportFocusShortcut";
import { useLatestRef } from "@/hooks/useLatestRef";
import type { Node } from "@/types/node";

type Options = {
  nodes: readonly Node[];
  selectedNodeId: number | null;
  isEditing: boolean;
  enabled: boolean;
  screen: ScreenSize | null;
  hasActiveGesture: () => boolean;
  onFocusNode: (node: Node, screen: ScreenSize) => void;
};

export function useMapViewportShortcut({
  nodes,
  selectedNodeId,
  isEditing,
  enabled,
  screen,
  hasActiveGesture,
  onFocusNode,
}: Options): void {
  const latestOptionsRef = useLatestRef({
    nodes,
    selectedNodeId,
    isEditing,
    enabled,
    screen,
    hasActiveGesture,
    onFocusNode,
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isViewportFocusShortcut(event)) return;
      const latestOptions = latestOptionsRef.current;
      if (!latestOptions.enabled) return;
      const request = resolveViewportFocusRequest({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        target: event.target,
        nodes: latestOptions.nodes,
        selectedNodeId: latestOptions.selectedNodeId,
        isEditing: latestOptions.isEditing,
        hasActiveGesture: latestOptions.hasActiveGesture(),
        screen: latestOptions.screen,
      });
      if (!request) return;
      event.preventDefault();
      latestOptions.onFocusNode(request.node, request.screen);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [latestOptionsRef]);
}
