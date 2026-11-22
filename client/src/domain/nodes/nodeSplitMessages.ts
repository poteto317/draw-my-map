import { MAX_SPLIT_FRAGMENTS, type NodeSplitFailureReason } from "@/domain/nodes/nodeSplit";
import type { OperationNotice } from "@/types/operationNotice";

// 分割が失敗した理由を、利用者向けの通知にする。ダイアログの状態文言とエラー表示も同じ文言を使う
export function formatNodeSplitFailureNotice(reason: NodeSplitFailureReason): OperationNotice {
  switch (reason) {
    case "node-missing":
    case "node-hidden":
    case "invalid-structure":
      return { kind: "error", message: "分割できるノードが選択されていません。" };
    case "separator-empty":
      return { kind: "error", message: "区切り文字を入力してください。" };
    case "not-splittable":
      return { kind: "error", message: "区切り文字で 2 つ以上に分けられません。" };
    case "too-many-fragments":
      return { kind: "error", message: `分割できるのは ${MAX_SPLIT_FRAGMENTS} 件までです。` };
    case "plan-changed":
      return { kind: "error", message: "分割の内容が変わりました。もう一度確認してください。" };
    case "id-conflict":
    case "placement-failed":
      return { kind: "error", message: "ノードを分割できませんでした。" };
    case "locked":
      return { kind: "error", message: "ロックされたノードは編集できません。" };
    default: {
      const unreachable: never = reason;
      return unreachable;
    }
  }
}
