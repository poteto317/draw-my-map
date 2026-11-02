import { formatNodeOnlyDeletionFailureNotice } from "../nodeOnlyDeletionMessages";

it.each([
  ["node-missing", "対象のノードが見つかりません。"],
  ["node-hidden", "表示されているノードを選択してください。"],
  ["invalid-structure", "ノードの構造を確認できないため削除できません。"],
  ["placement-failed", "配置できないため削除できません。"],
] as const)("%sをエラー通知へ変換する", (reason, message) => {
  expect(formatNodeOnlyDeletionFailureNotice(reason)).toEqual({ kind: "error", message });
});
