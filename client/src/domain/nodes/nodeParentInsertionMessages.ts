import type { NodeParentInsertionFailureReason } from "@/domain/nodes/nodeParentInsertion";
import type { OperationNotice } from "@/types/operationNotice";

const FAILURE_MESSAGE = "親ノードを挿入できませんでした。";

// 親ノードの挿入が失敗した理由を、利用者向けの通知にする（理由によらず同じ文言）
export function formatNodeParentInsertionFailureNotice(
  reason: NodeParentInsertionFailureReason,
): OperationNotice {
  switch (reason) {
    case "node-missing":
    case "node-hidden":
    case "invalid-structure":
    case "id-conflict":
    case "placement-failed":
      return { kind: "error", message: FAILURE_MESSAGE };
    default: {
      const unreachable: never = reason;
      return unreachable;
    }
  }
}
