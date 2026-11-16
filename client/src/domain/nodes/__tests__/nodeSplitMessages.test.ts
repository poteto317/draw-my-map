import type { NodeSplitFailureReason } from "@/domain/nodes/nodeSplit";
import { formatNodeSplitFailureNotice } from "@/domain/nodes/nodeSplitMessages";

describe("formatNodeSplitFailureNotice", () => {
  const cases: [NodeSplitFailureReason, string][] = [
    ["node-missing", "分割できるノードが選択されていません。"],
    ["node-hidden", "分割できるノードが選択されていません。"],
    ["invalid-structure", "分割できるノードが選択されていません。"],
    ["separator-empty", "区切り文字を入力してください。"],
    ["not-splittable", "区切り文字で 2 つ以上に分けられません。"],
    ["too-many-fragments", "分割できるのは 200 件までです。"],
    ["plan-changed", "分割の内容が変わりました。もう一度確認してください。"],
    ["id-conflict", "ノードを分割できませんでした。"],
    ["placement-failed", "ノードを分割できませんでした。"],
  ];

  it.each(cases)("%s はエラーの通知「%s」にする", (reason, message) => {
    expect(formatNodeSplitFailureNotice(reason)).toEqual({ kind: "error", message });
  });
});
