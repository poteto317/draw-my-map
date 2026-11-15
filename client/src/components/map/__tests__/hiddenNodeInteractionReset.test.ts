import {
  planHiddenNodeInteractionReset,
  sameHiddenInteractionSnapshot,
} from "@/components/map/hiddenNodeInteractionReset";

describe("planHiddenNodeInteractionReset", () => {
  it("主選択が隠れたら prune → gesture の順で返す", () => {
    expect(planHiddenNodeInteractionReset({
      selectedNodeIds: [1],
      selectedNodeId: 1,
      editingNodeId: null,
      visibleNodeIds: new Set([2]),
    })).toEqual({
      snapshot: {
        hiddenSelectedKey: "1",
        editingNodeId: null,
        primaryHidden: true,
      },
      actions: ["prune", "cancelGesture"],
    });
  });

  it("主選択かつ編集が隠れたら prune → gesture → editing の順", () => {
    expect(planHiddenNodeInteractionReset({
      selectedNodeIds: [1],
      selectedNodeId: 1,
      editingNodeId: 1,
      visibleNodeIds: new Set([2]),
    })?.actions).toEqual(["prune", "cancelGesture", "cancelEditing"]);
  });

  it("編集だけ隠れたら editing → gesture の順（主選択は可視）", () => {
    expect(planHiddenNodeInteractionReset({
      selectedNodeIds: [],
      selectedNodeId: null,
      editingNodeId: 1,
      visibleNodeIds: new Set([2]),
    })?.actions).toEqual(["cancelEditing", "cancelGesture"]);
  });

  it("非主選択のみ隠れても prune だけ返す", () => {
    expect(planHiddenNodeInteractionReset({
      selectedNodeIds: [1, 2],
      selectedNodeId: 2,
      editingNodeId: 2,
      visibleNodeIds: new Set([2]),
    })).toEqual({
      snapshot: {
        hiddenSelectedKey: "1",
        editingNodeId: null,
        primaryHidden: false,
      },
      actions: ["prune"],
    });
  });

  it("選択も編集も可視なら null", () => {
    expect(planHiddenNodeInteractionReset({
      selectedNodeIds: [1],
      selectedNodeId: 1,
      editingNodeId: 2,
      visibleNodeIds: new Set([1, 2]),
    })).toBeNull();
  });
});

describe("sameHiddenInteractionSnapshot", () => {
  it("同一内容なら true、差があれば false", () => {
    const snapshot = {
      hiddenSelectedKey: "1",
      editingNodeId: null as number | null,
      primaryHidden: true,
    };
    expect(sameHiddenInteractionSnapshot(snapshot, snapshot)).toBe(true);
    expect(sameHiddenInteractionSnapshot(null, snapshot)).toBe(false);
    expect(sameHiddenInteractionSnapshot(
      { ...snapshot, primaryHidden: false },
      snapshot,
    )).toBe(false);
  });
});
