import { useCallback, useState } from "react";
import type { RevisionScopedNodeRequest } from "@/types/revisionScopedNodeRequest";

// ノードへの要求（フォーカス・ラベルの編集など）を、発行した時点の documentRevision を添えて持つ。
// 同じノードへの要求でも sequence を1つずつ進め、documentRevision が変わった要求は描画時に隠す
export function useRevisionScopedNodeRequest(documentRevision: number) {
  const [stored, setStored] = useState<RevisionScopedNodeRequest | null>(null);

  const issueRequest = useCallback((nodeId: number) => {
    setStored((previous) => ({
      nodeId,
      sequence: (previous?.sequence ?? 0) + 1,
      documentRevision,
    }));
  }, [documentRevision]);

  const request = stored !== null && stored.documentRevision === documentRevision ? stored : null;

  return { request, issueRequest };
}
