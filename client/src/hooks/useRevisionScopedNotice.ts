import { useCallback, useState } from "react";
import type { OperationNotice } from "@/types/operationNotice";

// 通知を出した時点の documentRevision を添えて持つ（マップの置き換え・Undo/Redo の後に、古い通知を見分けるため）
type StoredNotice = { notice: OperationNotice; revision: number };

// 操作結果の通知を、次の通知か documentRevision の変化まで残す
export function useRevisionScopedNotice(documentRevision: number) {
  const [stored, setStored] = useState<StoredNotice | null>(null);

  // 保存時の revision が現在と違う通知は古いので、描画時に隠す
  const notice = stored !== null && stored.revision === documentRevision ? stored.notice : null;

  const publishNotice = useCallback((next: OperationNotice) => {
    setStored({ notice: next, revision: documentRevision });
  }, [documentRevision]);

  // 成功した操作の後に、前の通知を残さないために枠を空にする
  const clearNotice = useCallback(() => {
    setStored(null);
  }, []);

  return { notice, publishNotice, clearNotice };
}
