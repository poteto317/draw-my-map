"use client";

import { useEffect, useRef } from "react";
import type { ScreenSize } from "@/components/map/mapViewport";
import { classifyNodeRequest } from "@/components/map/nodeRequestProcessing";
import { useLatestRef } from "@/hooks/useLatestRef";
import type { Node } from "@/types/node";
import type { NodeFocusRequest } from "@/types/nodeFocusRequest";

type Options = {
  request: NodeFocusRequest | null;
  documentRevision: number;
  nodes: readonly Node[];
  screen: ScreenSize | null;
  hasActiveGesture: () => boolean;
  cancelActiveGesture: () => void;
  onFocusNode: (node: Node, screen: ScreenSize) => void;
};

export function useNodeFocusRequest({
  request,
  documentRevision,
  nodes,
  screen,
  hasActiveGesture,
  cancelActiveGesture,
  onFocusNode,
}: Options): void {
  const processedSequenceRef = useRef<number | null>(null);
  const latestOptionsRef = useLatestRef({
    nodes,
    hasActiveGesture,
    cancelActiveGesture,
    onFocusNode,
  });

  useEffect(() => {
    const latestOptions = latestOptionsRef.current;
    const processing = classifyNodeRequest(
      request,
      processedSequenceRef.current,
      documentRevision,
      latestOptions.nodes,
    );
    switch (processing.kind) {
      case "skip":
        return;
      case "discard":
        processedSequenceRef.current = processing.sequence;
        return;
      case "ready":
        // 画面の大きさが分かるまで処理済みにせず待つ
        if (screen === null) return;
        processedSequenceRef.current = processing.sequence;
        if (latestOptions.hasActiveGesture()) latestOptions.cancelActiveGesture();
        latestOptions.onFocusNode(processing.node, screen);
        return;
      default: {
        const unreachable: never = processing;
        return unreachable;
      }
    }
  }, [request, screen, nodes, documentRevision, latestOptionsRef]);
}
