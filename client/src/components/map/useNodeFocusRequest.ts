"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { ScreenSize } from "@/components/map/mapViewport";
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
  const latestOptionsRef = useRef({
    nodes,
    hasActiveGesture,
    cancelActiveGesture,
    onFocusNode,
  });

  useLayoutEffect(() => {
    latestOptionsRef.current = {
      nodes,
      hasActiveGesture,
      cancelActiveGesture,
      onFocusNode,
    };
  }, [nodes, hasActiveGesture, cancelActiveGesture, onFocusNode]);

  useEffect(() => {
    if (request === null) return;
    if (request.documentRevision !== documentRevision) {
      processedSequenceRef.current = request.sequence;
      return;
    }
    if (processedSequenceRef.current === request.sequence) return;

    const latestOptions = latestOptionsRef.current;
    const node = latestOptions.nodes.find((candidate) => candidate.id === request.nodeId);
    if (node === undefined) {
      processedSequenceRef.current = request.sequence;
      return;
    }
    if (screen === null) return;

    processedSequenceRef.current = request.sequence;
    if (latestOptions.hasActiveGesture()) latestOptions.cancelActiveGesture();
    latestOptions.onFocusNode(node, screen);
  }, [request, screen, nodes, documentRevision]);
}
