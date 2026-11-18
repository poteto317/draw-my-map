import type { NodeMergeFailureReason } from "@/domain/nodes/nodeMerge";
import { formatNodeMergeFailureNotice } from "@/domain/nodes/nodeMergeMessages";

describe("formatNodeMergeFailureNotice", () => {
  const cases: [NodeMergeFailureReason, string][] = [
    ["node-missing", "統合できるノードが見つかりません。"],
    ["node-hidden", "統合できるノードが見つかりません。"],
    ["invalid-structure", "統合できるノードが見つかりません。"],
    ["too-few-nodes", "2 つ以上のノードを選択してください。"],
    ["primary-missing", "主選択のノードがありません。"],
    ["different-parents", "同じ親の兄弟のノードだけを統合できます。"],
    ["plan-changed", "統合の内容が変わりました。もう一度確認してください。"],
    ["placement-failed", "ノードを統合できませんでした。"],
    ["note-too-long", "メモをまとめると文字数の上限（10,000 文字）を超えるため、統合できません。"],
    ["links-too-many", "URLをまとめると件数の上限（10 件）を超えるため、統合できません。"],
    ["tags-too-many", "タグをまとめると件数の上限（10 件）を超えるため、統合できません。"],
    ["sources-too-many", "出典をまとめると件数の上限（10 件）を超えるため、統合できません。"],
  ];

  it.each(cases)("%s はエラーの通知「%s」にする", (reason, message) => {
    expect(formatNodeMergeFailureNotice(reason)).toEqual({ kind: "error", message });
  });
});
