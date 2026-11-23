import {
  canSubmitBranchExtract,
  closeBranchExtractDialog,
  consumeBranchExtractFocusRequest,
  createBranchExtractDialogState,
  failBranchExtractDialog,
  openBranchExtractDialog,
  staleBranchExtractError,
} from "@/hooks/branchExtractDialogState";
import { createTestNode } from "@/testing/createTestNode";

const source = createTestNode({ id: 2, parentId: 1, label: "枝" });

const opened = openBranchExtractDialog(createBranchExtractDialogState(), { sourceId: 2, revision: 3 });

describe("branchExtractDialogState", () => {
  it("開閉とフォーカス要求", () => {
    expect(createBranchExtractDialogState()).toMatchObject({ screen: "closed", sourceId: null });
    expect(opened).toMatchObject({ screen: "open", sourceId: 2, openedRevision: 3, focusRequest: "dialog" });
    expect(closeBranchExtractDialog(opened)).toMatchObject({ screen: "closed", focusRequest: "header" });
    expect(consumeBranchExtractFocusRequest(opened)).toMatchObject({ focusRequest: null });
  });

  it("stale のときは送信不可でエラーを付ける", () => {
    expect(canSubmitBranchExtract({ state: opened, source, stale: true })).toBe(false);
    expect(staleBranchExtractError(opened.error).message).toContain("選び直してください");
  });

  it("source が無いときは送信不可", () => {
    expect(canSubmitBranchExtract({ state: opened, source: undefined, stale: false })).toBe(false);
    expect(canSubmitBranchExtract({ state: opened, source, stale: false })).toBe(true);
  });

  it("失敗メッセージを蓄積する", () => {
    const failed = failBranchExtractDialog(opened, "失敗");
    expect(failed.error.message).toBe("失敗");
    expect(failed.error.sequence).toBeGreaterThan(opened.error.sequence);
  });
});