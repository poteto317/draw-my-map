import { planPresenceMarkers } from "@/domain/nodes/planPresenceMarkers";
import { createTestNode } from "@/testing/createTestNode";

describe("planPresenceMarkers", () => {
  const root = createTestNode({ id: 1, parentId: null });
  const medium = createTestNode({ id: 2, parentId: 1 });
  const nodes = [root, medium];
  const structural = new Set([1, 2]);

  it("入力非完備なら null（成功の空に倒さない）", () => {
    expect(planPresenceMarkers({
      nodes,
      resolutionMode: "auto",
      collapseVisibleNodeIds: structural,
      focusVisibleNodeIds: null,
      // depth / display 欠落
    })).toBeNull();
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
});
