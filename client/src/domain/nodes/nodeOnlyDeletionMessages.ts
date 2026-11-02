import type { NodeOnlyDeletionFailureReason } from "@/domain/nodes/nodeOnlyDeletion";
import type { OperationNotice } from "@/types/operationNotice";

const messages: Record<NodeOnlyDeletionFailureReason, string> = {
  "node-missing": "対象のノードが見つかりません。",
  "node-hidden": "表示されているノードを選択してください。",
  "invalid-structure": "ノードの構造を確認できないため削除できません。",
  "placement-failed": "配置できないため削除できません。",
};

export function formatNodeOnlyDeletionFailureNotice(reason: NodeOnlyDeletionFailureReason): OperationNotice {
  return { kind: "error", message: messages[reason] };
}
