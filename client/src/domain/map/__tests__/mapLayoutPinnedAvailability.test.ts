import {
  isPinnedLayoutEditEnabled,
  isPinnedNodeDragBlocked,
  resolveLayoutPinnedContextMenu,
} from "@/domain/map/mapLayoutPinnedAvailability";
import { createTestNode } from "@/testing/createTestNode";

const nodes = [
  createTestNode({ id: 1, label: "a" }),
  createTestNode({ id: 2, parentId: 1, label: "b", x: 200, layoutPinned: true }),
  createTestNode({ id: 3, parentId: 1, label: "locked", x: 200, y: 200, locked: true }),
];

describe("resolveLayoutPinnedContextMenu (N5)", () => {
  const base = {
    viewMode: "map" as const,
    isProtectedMode: false,
    hasConflict: false,
    isExternallyDeleted: false,
    selectedNodeId: 1,
    selectedNodeIds: [1],
    contextMenuNodeId: 1,
    nodes,
  };

  it("マップ・主選択1で位置を固定が表示", () => {
    expect(resolveLayoutPinnedContextMenu(base)).toEqual({
      visible: true,
      disabled: false,
      action: "pin",
    });
  });

  it("ピン済みなら固定を解除", () => {
    expect(resolveLayoutPinnedContextMenu({
      ...base,
      selectedNodeId: 2,
      selectedNodeIds: [2],
      contextMenuNodeId: 2,
    })).toEqual({ visible: true, disabled: false, action: "unpin" });
  });

  it("アウトラインでは非表示", () => {
    expect(resolveLayoutPinnedContextMenu({ ...base, viewMode: "outline" }).visible).toBe(false);
  });

  it("保護・競合・関連線選択・グループ選択・locked で disabled", () => {
    expect(resolveLayoutPinnedContextMenu({ ...base, isProtectedMode: true }).disabled).toBe(true);
    expect(resolveLayoutPinnedContextMenu({ ...base, hasConflict: true }).disabled).toBe(true);
    expect(resolveLayoutPinnedContextMenu({
      ...base,
      canvasSelection: { type: "relation", id: 10 },
    }).disabled).toBe(true);
    expect(resolveLayoutPinnedContextMenu({
      ...base,
      canvasSelection: { type: "group", id: 10 },
    }).disabled).toBe(true);
    expect(resolveLayoutPinnedContextMenu({
      ...base,
      selectedNodeId: 3,
      selectedNodeIds: [3],
      contextMenuNodeId: 3,
    }).disabled).toBe(true);
  });
});

describe("isPinnedLayoutEditEnabled", () => {
  const base = {
    viewMode: "map" as const,
    isProtectedMode: false,
    hasConflict: false,
    isExternallyDeleted: false,
  };

  it("クリアなら有効", () => {
    expect(isPinnedLayoutEditEnabled(base)).toBe(true);
  });

  it("保護・競合・外部削除・非ノード選択で無効", () => {
    expect(isPinnedLayoutEditEnabled({ ...base, isProtectedMode: true })).toBe(false);
    expect(isPinnedLayoutEditEnabled({ ...base, hasConflict: true })).toBe(false);
    expect(isPinnedLayoutEditEnabled({ ...base, isExternallyDeleted: true })).toBe(false);
    expect(isPinnedLayoutEditEnabled({
      ...base,
      canvasSelection: { type: "relation", id: 1 },
    })).toBe(false);
    expect(isPinnedLayoutEditEnabled({
      ...base,
      canvasSelection: { type: "group", id: 1 },
    })).toBe(false);
  });
});

describe("isPinnedNodeDragBlocked (N6)", () => {
  const base = {
    viewMode: "map" as const,
    isProtectedMode: false,
    hasConflict: false,
    isExternallyDeleted: false,
    layoutMode: "auto" as const,
    node: nodes[1],
  };

  it("auto+ピンは許可", () => {
    expect(isPinnedNodeDragBlocked(base)).toBe(false);
  });

  it("locked／保護／競合／関連線／グループ／manual／非ピンは拒否", () => {
    expect(isPinnedNodeDragBlocked({
      ...base,
      node: { ...nodes[1]!, locked: true },
    })).toBe(true);
    expect(isPinnedNodeDragBlocked({ ...base, isProtectedMode: true })).toBe(true);
    expect(isPinnedNodeDragBlocked({ ...base, hasConflict: true })).toBe(true);
    expect(isPinnedNodeDragBlocked({
      ...base,
      canvasSelection: { type: "relation", id: 1 },
    })).toBe(true);
    expect(isPinnedNodeDragBlocked({
      ...base,
      canvasSelection: { type: "group", id: 1 },
    })).toBe(true);
    expect(isPinnedNodeDragBlocked({ ...base, layoutMode: "manual" })).toBe(true);
    expect(isPinnedNodeDragBlocked({ ...base, node: nodes[0] })).toBe(true);
  });
});
