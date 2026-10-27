import { formatNodeParentInsertionFailureNotice } from "@/domain/nodes/nodeParentInsertionMessages";

describe("formatNodeParentInsertionFailureNotice", () => {
  it.each(["node-missing", "node-hidden", "invalid-structure", "id-conflict", "placement-failed"] as const)(
    "%s は理由によらず同じ文言のエラー通知にする",
    (reason) => {
      expect(formatNodeParentInsertionFailureNotice(reason)).toEqual({
        kind: "error",
        message: "親ノードを挿入できませんでした。",
      });
    },
  );
});
