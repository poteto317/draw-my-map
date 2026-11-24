import {
  isNodeTargetOperationBlocked,
  relationSelection,
} from "@/domain/map/mapCanvasSelectionGuards";
import {
  resolveRelationAddContextMenu,
  resolveRelationConnectContextMenu,
} from "@/domain/map/mapRelationAvailability";
import { createTestNode } from "@/testing/createTestNode";

/**
 * Task2 RED/GREEN: inventory 代表経路が relation 選択中に無効、
 * およびアウトライン／保護の入口ガード。
 */
describe("relation selection guards (inventory representatives)", () => {
  const nodes = [
    createTestNode({ id: 1, label: "a" }),
    createTestNode({ id: 2, parentId: 1, label: "b", x: 200 }),
  ];

  it("relation 選択中はノード対象操作ブロック（U31–U41 等の代表）", () => {
    expect(isNodeTargetOperationBlocked(relationSelection(10))).toBe(true);
  });

  it("アウトラインでは関連線追加メニューが非表示", () => {
    expect(resolveRelationAddContextMenu({
      viewMode: "outline",
      isProtectedMode: false,
      hasConflict: false,
      isExternallyDeleted: false,
      selectedNodeId: 1,
      selectedNodeIds: [1],
      contextMenuNodeId: 1,
      nodes,
      relations: undefined,
    }).visible).toBe(false);
  });

  it("保護モードでは結ぶが disabled", () => {
    expect(resolveRelationConnectContextMenu({
      viewMode: "map",
      isProtectedMode: true,
      hasConflict: false,
      isExternallyDeleted: false,
      selectedNodeIds: [1, 2],
      nodes,
      relations: undefined,
    })).toEqual({ visible: true, disabled: true });
  });
});
