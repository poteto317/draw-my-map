import { useCallback, useState } from "react";
import type { OperationNotice } from "@/types/operationNotice";

type UseNodeDuplicationActionOptions = {
  selectedNodeId: number | null;
  documentRevision: number;
  duplicateSubtree: (sourceId: number) => number | null;
};

// 通知を出した時点の documentRevision を添えて持つ（マップの置き換え・Undo/Redo の後に、古い通知を見分けるため）
type StoredNotice = { notice: OperationNotice; revision: number };

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
  const [stored, setStored] = useState<StoredNotice | null>(null);

  // 保存時の revision が現在と違う通知は古いので、描画時に隠す
  const notice = stored !== null && stored.revision === documentRevision ? stored.notice : null;

  const duplicateSelected = useCallback(() => {
    if (selectedNodeId === null) return;
    const copiedRootId = duplicateSubtree(selectedNodeId);
    setStored({
      notice: copiedRootId === null ? FAILURE_NOTICE : SUCCESS_NOTICE,
      revision: documentRevision,
    });
  }, [selectedNodeId, documentRevision, duplicateSubtree]);

  return { duplicateSelected, notice };
}
