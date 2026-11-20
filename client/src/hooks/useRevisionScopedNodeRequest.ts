import { useCallback, useRef, useState } from "react";
import { useLatestRef } from "@/hooks/useLatestRef";
import type { RevisionScopedNodeRequest } from "@/types/revisionScopedNodeRequest";

// ノードへの要求（フォーカス・ラベルの編集など）を、発行した時点の documentRevision を添えて持つ。
// 同じノードへの要求でも sequence を1つずつ進め、documentRevision が変わった要求は描画時に隠す
export function useRevisionScopedNodeRequest(documentRevision: number) {
  const [stored, setStored] = useState<RevisionScopedNodeRequest | null>(null);

  const sequence = useRef(0);
  const issuedRef = useRef<RevisionScopedNodeRequest | null>(null);
  const revisionRef = useLatestRef(documentRevision);
  const clearRequest = useCallback(() => {
    issuedRef.current = null;
    setStored(null);
  }, []);

  const issueRequest = useCallback((nodeId: number) => {
    const request = { nodeId, sequence: ++sequence.current, documentRevision };
    issuedRef.current = request;
    setStored(request);
    return request;
  }, [documentRevision]);

  const isCurrentRequest = useCallback((request: RevisionScopedNodeRequest) => (
    issuedRef.current?.sequence === request.sequence && revisionRef.current === request.documentRevision
  ), [revisionRef]);

  const finishRequest = useCallback((request: RevisionScopedNodeRequest) => {
    if (isCurrentRequest(request)) issuedRef.current = null;
  }, [isCurrentRequest]);

  const request = stored !== null && stored.documentRevision === documentRevision ? stored : null;

  return { request, issueRequest, clearRequest, isCurrentRequest, finishRequest };
}
