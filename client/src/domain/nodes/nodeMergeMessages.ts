import { NODE_LINKS_MAX_COUNT } from "@/domain/nodes/nodeLink";
import { NODE_MAP_LINKS_MAX_COUNT } from "@/domain/nodes/nodeMapLink";
import { NODE_NOTE_MAX_LENGTH, formatNodeNoteLength } from "@/domain/nodes/nodeNote";
import { NODE_SOURCES_MAX_COUNT } from "@/domain/nodes/nodeSource";
import { NODE_TAGS_MAX_COUNT } from "@/domain/nodes/nodeTag";
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
    case "note-too-long":
      return { kind: "error", message: `メモをまとめると文字数の上限（${formatNodeNoteLength(NODE_NOTE_MAX_LENGTH)} 文字）を超えるため、統合できません。` };
    case "links-too-many":
      return { kind: "error", message: `URLをまとめると件数の上限（${NODE_LINKS_MAX_COUNT} 件）を超えるため、統合できません。` };
    case "tags-too-many":
      return { kind: "error", message: `タグをまとめると件数の上限（${NODE_TAGS_MAX_COUNT} 件）を超えるため、統合できません。` };
    case "sources-too-many":
      return { kind: "error", message: `出典をまとめると件数の上限（${NODE_SOURCES_MAX_COUNT} 件）を超えるため、統合できません。` };
    case "map-links-too-many":
      return { kind: "error", message: `マップ間リンクをまとめると件数の上限（${NODE_MAP_LINKS_MAX_COUNT} 件）を超えるため、統合できません。` };
    default: {
      const unreachable: never = reason;
      return unreachable;
    }
  }
}
