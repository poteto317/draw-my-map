import type { NodeMergeFailureReason } from "@/domain/nodes/nodeMerge";
import type { OperationNotice } from "@/types/operationNotice";

// 統合が失敗した理由を、利用者向けの通知にする。ダイアログの状態文言とエラー表示も同じ文言を使う
export function formatNodeMergeFailureNotice(reason: NodeMergeFailureReason): OperationNotice {
  switch (reason) {
    case "node-missing":
    case "node-hidden":
    case "invalid-structure":
      return { kind: "error", message: "統合できるノードが見つかりません。" };
    case "too-few-nodes":
      return { kind: "error", message: "2 つ以上のノードを選択してください。" };
    case "primary-missing":
      return { kind: "error", message: "主選択のノードがありません。" };
    case "different-parents":
      return { kind: "error", message: "同じ親の兄弟のノードだけを統合できます。" };
    case "plan-changed":
      return { kind: "error", message: "統合の内容が変わりました。もう一度確認してください。" };
    case "placement-failed":
      return { kind: "error", message: "ノードを統合できませんでした。" };
    default: {
      const unreachable: never = reason;
      return unreachable;
    }
  }
}
