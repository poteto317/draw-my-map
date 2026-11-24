import {
  resolveBranchGroupContextMenu,
  resolveGroupCreateContextMenu,
  resolveGroupDeleteAvailability,
  resolveGroupLabelEditAvailability,
} from "@/domain/map/mapGroupAvailability";
import { createTestNode } from "@/testing/createTestNode";
import type { MapGroup } from "@/types/mapGroup";

function group(partial: Partial<MapGroup> & Pick<MapGroup, "id" | "nodeIds">): MapGroup {
  return { label: "", ...partial };
}

const nodes = [
  createTestNode({ id: 1, label: "a" }),
  createTestNode({ id: 2, parentId: 1, label: "b", x: 200 }),
  createTestNode({ id: 3, parentId: 1, label: "c", x: 200, y: 100 }),
  // 別枝の locked（1 の subtree に含めない）
  createTestNode({ id: 4, label: "locked", x: 400, y: 0, locked: true }),
  createTestNode({ id: 5, parentId: 4, label: "locked-child", x: 400, y: 100, locked: true }),
];

const openDoc = {
  viewMode: "map" as const,
  isProtectedMode: false,
  hasConflict: false,
  isExternallyDeleted: false,
};

describe("resolveGroupCreateContextMenu", () => {
  it("マップ・選択≥2 のとき visible", () => {
    expect(resolveGroupCreateContextMenu({
      ...openDoc,
      selectedNodeIds: [1, 2],
      nodes,
    })).toEqual({ visible: true, disabled: false });
  });

  it("アウトラインでは非表示", () => {
    expect(resolveGroupCreateContextMenu({
      ...openDoc,
      viewMode: "outline",
      selectedNodeIds: [1, 2],
      nodes,
    }).visible).toBe(false);
  });

  it("保護・競合・外部削除・メンバー locked で disabled（関連線と同則）", () => {
    expect(resolveGroupCreateContextMenu({
      ...openDoc,
      isProtectedMode: true,
      selectedNodeIds: [1, 2],
      nodes,
    }).disabled).toBe(true);
    expect(resolveGroupCreateContextMenu({
      ...openDoc,
      hasConflict: true,
      selectedNodeIds: [1, 2],
      nodes,
    }).disabled).toBe(true);
    expect(resolveGroupCreateContextMenu({
      ...openDoc,
      isExternallyDeleted: true,
      selectedNodeIds: [1, 2],
      nodes,
    }).disabled).toBe(true);
    expect(resolveGroupCreateContextMenu({
      ...openDoc,
      selectedNodeIds: [1, 4],
      nodes,
    }).disabled).toBe(true);
  });
});

describe("resolveBranchGroupContextMenu", () => {
  it("マップ・主選択1・subtree≥2 のとき visible", () => {
    expect(resolveBranchGroupContextMenu({
      ...openDoc,
      selectedNodeId: 1,
      selectedNodeIds: [1],
      contextMenuNodeId: 1,
      nodes,
    })).toEqual({ visible: true, disabled: false });
  });

  it("葉ノード（subtree<2）・複数選択・アウトラインでは非表示", () => {
    expect(resolveBranchGroupContextMenu({
      ...openDoc,
      selectedNodeId: 2,
      selectedNodeIds: [2],
      contextMenuNodeId: 2,
      nodes,
    }).visible).toBe(false);
    expect(resolveBranchGroupContextMenu({
      ...openDoc,
      selectedNodeId: 1,
      selectedNodeIds: [1, 2],
      contextMenuNodeId: 1,
      nodes,
    }).visible).toBe(false);
    expect(resolveBranchGroupContextMenu({
      ...openDoc,
      viewMode: "outline",
      selectedNodeId: 1,
      selectedNodeIds: [1],
      contextMenuNodeId: 1,
      nodes,
    }).visible).toBe(false);
  });

  it("subtree に locked があれば disabled", () => {
    expect(resolveBranchGroupContextMenu({
      ...openDoc,
      selectedNodeId: 4,
      selectedNodeIds: [4],
      contextMenuNodeId: 4,
      nodes,
    })).toEqual({ visible: true, disabled: true });
  });
});

describe("resolveGroupDeleteAvailability / label edit", () => {
  it("削除・ラベル編集は同じガード", () => {
    const target = group({ id: 20, nodeIds: [1, 2] });
    expect(resolveGroupDeleteAvailability({
      ...openDoc,
      nodes,
      group: target,
    }).enabled).toBe(true);
    expect(resolveGroupLabelEditAvailability({
      ...openDoc,
      nodes,
      group: target,
    }).enabled).toBe(true);

    expect(resolveGroupDeleteAvailability({
      ...openDoc,
      isProtectedMode: true,
      nodes,
      group: target,
    }).enabled).toBe(false);
    expect(resolveGroupDeleteAvailability({
      ...openDoc,
      nodes,
      group: group({ id: 20, nodeIds: [1, 4] }),
    }).enabled).toBe(false);
  });
});
