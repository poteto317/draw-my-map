import { planPresenceMarkers } from "@/domain/nodes/planPresenceMarkers";
import { createTestNode } from "@/testing/createTestNode";

describe("planPresenceMarkers", () => {
  const root = createTestNode({ id: 1, parentId: null });
  const medium = createTestNode({ id: 2, parentId: 1 });
  const nodes = [root, medium];
  const structural = new Set([1, 2]);

  it("入力非完備なら null（成功の空に倒さない）。warn は呼び出し hook 側", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(planPresenceMarkers({
        nodes,
        resolutionMode: "auto",
        collapseVisibleNodeIds: structural,
        focusVisibleNodeIds: null,
        // depth / display 欠落
      })).toBeNull();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("auto で structural−display が非空なら presence を返す", () => {
    const plan = planPresenceMarkers({
      nodes,
      resolutionMode: "auto",
      collapseVisibleNodeIds: structural,
      focusVisibleNodeIds: null,
      depthVisibleNodeIds: structural,
      displayVisibleNodeIds: new Set([1]),
    });

    expect(plan).not.toBeNull();
    expect(plan!.presenceNodeIds).toEqual(new Set([2]));
    expect(plan!.presenceEdgeChildIds).toEqual([2]);
  });

  it("手動モードでは成功の空", () => {
    const plan = planPresenceMarkers({
      nodes,
      resolutionMode: "high",
      collapseVisibleNodeIds: structural,
      focusVisibleNodeIds: null,
      depthVisibleNodeIds: structural,
      displayVisibleNodeIds: new Set([1]),
    });

    expect(plan).not.toBeNull();
    expect(plan!.presenceNodeIds).toEqual(new Set());
    expect(plan!.presenceEdgeChildIds).toEqual([]);
  });

  it("フル edge がある子は presence 枝に入れない", () => {
    const display = new Set([1, 2]);
    const plan = planPresenceMarkers({
      nodes,
      resolutionMode: "auto",
      collapseVisibleNodeIds: structural,
      focusVisibleNodeIds: null,
      depthVisibleNodeIds: structural,
      displayVisibleNodeIds: display,
    });

    expect(plan!.presenceNodeIds).toEqual(new Set());
    expect(plan!.presenceEdgeChildIds).toEqual([]);
  });

  it("collapse で structural から外れた子孫は presence に入らない", () => {
    const tree = [
      createTestNode({ id: 1, parentId: null, importance: "high" }),
      createTestNode({ id: 2, parentId: 1, importance: "medium" }),
      createTestNode({ id: 3, parentId: 2, importance: "medium" }),
    ];
    // 親だけ可視（折りたたみで子孫が structural から外れる）
    const collapseVisible = new Set([1]);
    const allIds = new Set([1, 2, 3]);
    // display も親のみ（ズームアウト相当）。collapse 無しなら 2,3 が presence 候補になる
    const plan = planPresenceMarkers({
      nodes: tree,
      resolutionMode: "auto",
      collapseVisibleNodeIds: collapseVisible,
      focusVisibleNodeIds: null,
      depthVisibleNodeIds: allIds,
      displayVisibleNodeIds: new Set([1]),
    });

    expect(plan).not.toBeNull();
    expect(plan!.presenceNodeIds.has(2)).toBe(false);
    expect(plan!.presenceNodeIds.has(3)).toBe(false);
    expect(plan!.presenceNodeIds).toEqual(new Set());
    expect(plan!.presenceEdgeChildIds).toEqual([]);
  });
});
