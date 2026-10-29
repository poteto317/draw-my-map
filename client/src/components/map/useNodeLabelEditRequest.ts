"use client";

import { useLayoutEffect, useRef } from "react";
import { classifyNodeRequest } from "@/components/map/nodeRequestProcessing";
import type { Node } from "@/types/node";
import type { NodeLabelEditRequest } from "@/types/nodeLabelEditRequest";

export type UseNodeLabelEditRequestOptions = {
  request: NodeLabelEditRequest | null;
  documentRevision: number;
  nodes: readonly Node[];
  hasActiveGesture: () => boolean;
  cancelActiveGesture: () => void;
  startEditing: (nodeId: number, initialText?: string) => void;
};

export function useNodeLabelEditRequest({
  request,
  documentRevision,
  nodes,
  hasActiveGesture,
  cancelActiveGesture,
  startEditing,
}: UseNodeLabelEditRequestOptions): void {
  const processedSequenceRef = useRef<number | null>(null);
  const latestCallbacksRef = useRef({ hasActiveGesture, cancelActiveGesture, startEditing });

  useLayoutEffect(() => {
    latestCallbacksRef.current = { hasActiveGesture, cancelActiveGesture, startEditing };
  }, [hasActiveGesture, cancelActiveGesture, startEditing]);

  // 画面に出る前に入力欄を描き、autoFocus でフォーカスを移すため useLayoutEffect で処理する。
  useLayoutEffect(() => {
    const processing = classifyNodeRequest(request, processedSequenceRef.current, documentRevision, nodes);
    switch (processing.kind) {
      case "skip":
        return;
      case "discard":
        processedSequenceRef.current = processing.sequence;
        return;
      case "ready": {
        processedSequenceRef.current = processing.sequence;
        const callbacks = latestCallbacksRef.current;
        if (callbacks.hasActiveGesture()) callbacks.cancelActiveGesture();
        callbacks.startEditing(processing.node.id, "");
        return;
      }
      default: {
        const unreachable: never = processing;
        return unreachable;
      }
    }
  }, [request, documentRevision, nodes]);
}
