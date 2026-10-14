import { useCallback } from "react";
import { useRevisionScopedNotice } from "@/hooks/useRevisionScopedNotice";
import type { OperationNotice } from "@/types/operationNotice";

type UseNodeDuplicationActionOptions = {
  selectedNodeId: number | null;
  documentRevision: number;
  duplicateSubtree: (sourceId: number) => number | null;
};

const SUCCESS_NOTICE: OperationNotice = {
  kind: "status",
  message: "枝を複製しました。Fキーで選択ノードへ移動できます。",
};

const FAILURE_NOTICE: OperationNotice = {
  kind: "error",
  message: "枝を複製できませんでした。",
};

// 選択ノードの枝を複製し、結果を通知する。通知は次の複製要求か documentRevision の変化まで残す
export function useNodeDuplicationAction({
  selectedNodeId,
  documentRevision,
  duplicateSubtree,
}: UseNodeDuplicationActionOptions) {
  const { notice, publishNotice } = useRevisionScopedNotice(documentRevision);

  const duplicateSelected = useCallback(() => {
    if (selectedNodeId === null) return;
    const copiedRootId = duplicateSubtree(selectedNodeId);
    publishNotice(copiedRootId === null ? FAILURE_NOTICE : SUCCESS_NOTICE);
  }, [selectedNodeId, duplicateSubtree, publishNotice]);

  return { duplicateSelected, notice };
}
