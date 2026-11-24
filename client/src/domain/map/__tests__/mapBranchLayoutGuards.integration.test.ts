import {
  isNodeTargetOperationBlocked,
  relationSelection,
  groupSelection,
} from "@/domain/map/mapCanvasSelectionGuards";
import { resolveBranchLayoutContextMenu } from "@/domain/map/mapBranchLayoutAvailability";
import { applySetBranchLayout } from "@/domain/nodes/nodeBranchLayout";
import { createTestNode } from "@/testing/createTestNode";

/**
 * Task3 RED/GREEN: inventory 代表経路で枝方向入口 N4 が disabled／拒否になること。
 */
describe("branchLayouts guards (inventory representatives)", () => {
  const nodes = [
    createTestNode({ id: 1, label: "a" }),
    createTestNode({ id: 2, parentId: 1, label: "b", x: 200 }),
    createTestNode({ id: 3, label: "locked", locked: true }),
  ];

  const base = {
    viewMode: "map" as const,
    isProtectedMode: false,
    hasConflict: false,
    isExternallyDeleted: false,
    selectedNodeId: 1 as number | null,
    selectedNodeIds: [1] as readonly number[],
    contextMenuNodeId: 1,
    nodes,
    layoutStyle: undefined as "orthogonal" | "radial" | undefined,
    branchLayouts: undefined as undefined,
  };

  it("関連線／グループ選択中はノード対象操作ブロック（U42 代表）", () => {
    expect(isNodeTargetOperationBlocked(relationSelection(10))).toBe(true);
    expect(isNodeTargetOperationBlocked(groupSelection(10))).toBe(true);
  });

  it("アウトラインでは枝方向メニューが非表示", () => {
    expect(resolveBranchLayoutContextMenu({
      ...base,
      viewMode: "outline",
    }).visible).toBe(false);
  });

  it("保護モードでは枝方向メニューが disabled", () => {
    expect(resolveBranchLayoutContextMenu({
      ...base,
      isProtectedMode: true,
    })).toMatchObject({ visible: true, disabled: true });
  });

  it("競合では枝方向メニューが disabled", () => {
    expect(resolveBranchLayoutContextMenu({
      ...base,
      hasConflict: true,
    })).toMatchObject({ visible: true, disabled: true });
  });

  it("関連線／グループ選択中は枝方向メニューが disabled", () => {
    expect(resolveBranchLayoutContextMenu({
      ...base,
      canvasSelection: relationSelection(1),
    })).toMatchObject({ visible: true, disabled: true });
    expect(resolveBranchLayoutContextMenu({
      ...base,
      canvasSelection: groupSelection(1),
    })).toMatchObject({ visible: true, disabled: true });
  });

  it("locked は API 拒否かつ UI disabled", () => {
    expect(applySetBranchLayout(nodes, undefined, 3, "rl")).toEqual({
      ok: false,
      reason: "locked",
    });
    expect(resolveBranchLayoutContextMenu({
      ...base,
      selectedNodeId: 3,
      selectedNodeIds: [3],
      contextMenuNodeId: 3,
    }).disabled).toBe(true);
  });

  it("radial では UI disabled（値保持）", () => {
    expect(resolveBranchLayoutContextMenu({
      ...base,
      layoutStyle: "radial",
      branchLayouts: [{ nodeId: 1, direction: "tb" }],
    })).toMatchObject({ visible: true, disabled: true, currentDirection: "tb" });
  });
});
