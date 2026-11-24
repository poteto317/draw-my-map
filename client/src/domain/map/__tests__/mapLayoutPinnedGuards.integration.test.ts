import {
  isNodeTargetOperationBlocked,
  relationSelection,
  groupSelection,
} from "@/domain/map/mapCanvasSelectionGuards";
import {
  isPinnedNodeDragBlocked,
  resolveLayoutPinnedContextMenu,
} from "@/domain/map/mapLayoutPinnedAvailability";
import { applySetNodeLayoutPinned } from "@/domain/nodes/nodeLayoutPinned";
import { createTestNode } from "@/testing/createTestNode";

/**
 * Task2 RED/GREEN: inventory 代表経路（アウトライン／保護／競合／関連線／グループ／locked）
 * でピン入口 N5 とピンドラッグ N6 が disabled／拒否になること。
 */
describe("layoutPinned guards (inventory representatives)", () => {
  const nodes = [
    createTestNode({ id: 1, label: "a" }),
    createTestNode({ id: 2, parentId: 1, label: "b", x: 200, layoutPinned: true }),
    createTestNode({ id: 3, label: "locked", locked: true }),
  ];

  it("関連線／グループ選択中はノード対象操作ブロック（U43 代表）", () => {
    expect(isNodeTargetOperationBlocked(relationSelection(10))).toBe(true);
    expect(isNodeTargetOperationBlocked(groupSelection(10))).toBe(true);
  });

  it("アウトラインではピンメニューが非表示", () => {
    expect(resolveLayoutPinnedContextMenu({
      viewMode: "outline",
      isProtectedMode: false,
      hasConflict: false,
      isExternallyDeleted: false,
      selectedNodeId: 1,
      selectedNodeIds: [1],
      contextMenuNodeId: 1,
      nodes,
    }).visible).toBe(false);
  });

  it("保護モードではピンメニューが disabled", () => {
    expect(resolveLayoutPinnedContextMenu({
      viewMode: "map",
      isProtectedMode: true,
      hasConflict: false,
      isExternallyDeleted: false,
      selectedNodeId: 1,
      selectedNodeIds: [1],
      contextMenuNodeId: 1,
      nodes,
    })).toMatchObject({ visible: true, disabled: true });
  });

  it("locked は API 拒否かつ UI disabled", () => {
    expect(applySetNodeLayoutPinned(nodes, 3, true)).toEqual({
      ok: false,
      reason: "locked",
    });
    expect(resolveLayoutPinnedContextMenu({
      viewMode: "map",
      isProtectedMode: false,
      hasConflict: false,
      isExternallyDeleted: false,
      selectedNodeId: 3,
      selectedNodeIds: [3],
      contextMenuNodeId: 3,
      nodes,
    }).disabled).toBe(true);
  });

  it("ピンドラッグ N6 は locked／保護／競合／関連線／グループで拒否", () => {
    const pinned = nodes[1]!;
    expect(isPinnedNodeDragBlocked({
      viewMode: "map",
      isProtectedMode: false,
      hasConflict: false,
      isExternallyDeleted: false,
      layoutMode: "auto",
      node: pinned,
    })).toBe(false);
    expect(isPinnedNodeDragBlocked({
      viewMode: "map",
      isProtectedMode: false,
      hasConflict: false,
      isExternallyDeleted: false,
      layoutMode: "auto",
      node: { ...pinned, locked: true },
    })).toBe(true);
    expect(isPinnedNodeDragBlocked({
      viewMode: "map",
      isProtectedMode: true,
      hasConflict: false,
      isExternallyDeleted: false,
      layoutMode: "auto",
      node: pinned,
    })).toBe(true);
    expect(isPinnedNodeDragBlocked({
      viewMode: "map",
      isProtectedMode: false,
      hasConflict: true,
      isExternallyDeleted: false,
      layoutMode: "auto",
      node: pinned,
    })).toBe(true);
    expect(isPinnedNodeDragBlocked({
      viewMode: "map",
      isProtectedMode: false,
      hasConflict: false,
      isExternallyDeleted: false,
      layoutMode: "auto",
      node: pinned,
      canvasSelection: relationSelection(1),
    })).toBe(true);
    expect(isPinnedNodeDragBlocked({
      viewMode: "map",
      isProtectedMode: false,
      hasConflict: false,
      isExternallyDeleted: false,
      layoutMode: "auto",
      node: pinned,
      canvasSelection: groupSelection(1),
    })).toBe(true);
  });
});
