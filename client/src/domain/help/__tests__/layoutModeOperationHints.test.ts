import { LAYOUT_MODE_OPERATION_HINTS } from "@/domain/help/layoutModeOperationHints";

describe("LAYOUT_MODE_OPERATION_HINTS", () => {
  it("手動モードはノードのドラッグ移動を案内し、自動整列は案内しない", () => {
    const hint = LAYOUT_MODE_OPERATION_HINTS.manual;
    expect(hint).toContain("ノードドラッグで移動");
    expect(hint).not.toContain("追加・削除・接続時に自動整列");
  });

  it("自動モードは自動整列を案内し、ノードのドラッグ移動は案内しない", () => {
    const hint = LAYOUT_MODE_OPERATION_HINTS.auto;
    expect(hint).toContain("追加・削除・接続時に自動整列");
    expect(hint).not.toContain("ノードドラッグで移動");
  });

  it("両モードの全文が空でない", () => {
    expect(LAYOUT_MODE_OPERATION_HINTS.manual.length).toBeGreaterThan(0);
    expect(LAYOUT_MODE_OPERATION_HINTS.auto.length).toBeGreaterThan(0);
  });
});
