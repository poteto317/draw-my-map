import {
  groupSelection,
  isNodeTargetOperationBlocked,
} from "@/domain/map/mapCanvasSelectionGuards";
import {
  resolveBranchGroupContextMenu,
  resolveGroupCreateContextMenu,
} from "@/domain/map/mapGroupAvailability";
import { createTestNode } from "@/testing/createTestNode";

/**
 * Task4 RED/GREEN: inventory 代表経路が group 選択中に無効、
 * およびアウトライン／保護の入口ガード。
 */
describe("group selection guards (inventory representatives)", () => {
  const nodes = [
    createTestNode({ id: 1, label: "a" }),
    createTestNode({ id: 2, parentId: 1, label: "b", x: 200 }),
  ];

  it("group 選択中はノード対象操作ブロック（U31–U41 等の代表）", () => {
    expect(isNodeTargetOperationBlocked(groupSelection(20))).toBe(true);
  });

  it("アウトラインではグループ化メニューが非表示", () => {
    expect(resolveGroupCreateContextMenu({
      viewMode: "outline",
      isProtectedMode: false,
      hasConflict: false,
      isExternallyDeleted: false,
      selectedNodeIds: [1, 2],
      nodes,
    }).visible).toBe(false);
  });

  it("保護モードでは枝グループ化が disabled", () => {
    expect(resolveBranchGroupContextMenu({
      viewMode: "map",
      isProtectedMode: true,
      hasConflict: false,
      isExternallyDeleted: false,
      selectedNodeId: 1,
      selectedNodeIds: [1],
      contextMenuNodeId: 1,
      nodes,
    })).toEqual({ visible: true, disabled: true });
  });

  it("グループ化メニューは保護モードで disabled", () => {
    expect(resolveGroupCreateContextMenu({
      viewMode: "map",
      isProtectedMode: true,
      hasConflict: false,
      isExternallyDeleted: false,
      selectedNodeIds: [1, 2],
      nodes,
    })).toEqual({ visible: true, disabled: true });
  });
});
