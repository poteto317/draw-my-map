import { resolveBranchLayoutContextMenu } from "@/domain/map/mapBranchLayoutAvailability";
import { createTestNode } from "@/testing/createTestNode";

const nodes = [
  createTestNode({ id: 1, label: "a" }),
  createTestNode({ id: 2, parentId: 1, label: "b", x: 200 }),
  createTestNode({ id: 3, label: "locked", locked: true }),
];

describe("resolveBranchLayoutContextMenu (N4)", () => {
  it("マップ・orthogonal・主選択1で表示", () => {
    expect(resolveBranchLayoutContextMenu({
      viewMode: "map",
      isProtectedMode: false,
      hasConflict: false,
      isExternallyDeleted: false,
      selectedNodeId: 1,
      selectedNodeIds: [1],
      contextMenuNodeId: 1,
      nodes,
      layoutStyle: undefined,
      branchLayouts: undefined,
    })).toMatchObject({ visible: true, disabled: false });
  });

  it("アウトラインでは非表示", () => {
    expect(resolveBranchLayoutContextMenu({
      viewMode: "outline",
      isProtectedMode: false,
      hasConflict: false,
      isExternallyDeleted: false,
      selectedNodeId: 1,
      selectedNodeIds: [1],
      contextMenuNodeId: 1,
      nodes,
      layoutStyle: "orthogonal",
      branchLayouts: undefined,
    }).visible).toBe(false);
  });

  it("radial では disabled（値保持）", () => {
    expect(resolveBranchLayoutContextMenu({
      viewMode: "map",
      isProtectedMode: false,
      hasConflict: false,
      isExternallyDeleted: false,
      selectedNodeId: 1,
      selectedNodeIds: [1],
      contextMenuNodeId: 1,
      nodes,
      layoutStyle: "radial",
      branchLayouts: [{ nodeId: 1, direction: "rl" }],
    })).toMatchObject({ visible: true, disabled: true, currentDirection: "rl" });
  });

  it("locked は disabled", () => {
    expect(resolveBranchLayoutContextMenu({
      viewMode: "map",
      isProtectedMode: false,
      hasConflict: false,
      isExternallyDeleted: false,
      selectedNodeId: 3,
      selectedNodeIds: [3],
      contextMenuNodeId: 3,
      nodes,
      layoutStyle: "orthogonal",
      branchLayouts: undefined,
    }).disabled).toBe(true);
  });
});
