"use client";

import { useLayoutEffect, useRef } from "react";
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
    if (request === null) return;
    if (processedSequenceRef.current === request.sequence) return;
    if (request.documentRevision !== documentRevision) {
      processedSequenceRef.current = request.sequence;
      return;
    }
    if (!nodes.some((node) => node.id === request.nodeId)) {
      processedSequenceRef.current = request.sequence;
      return;
    }

    processedSequenceRef.current = request.sequence;
    const callbacks = latestCallbacksRef.current;
    if (callbacks.hasActiveGesture()) callbacks.cancelActiveGesture();
    callbacks.startEditing(request.nodeId, "");
  }, [request, documentRevision, nodes]);
}
