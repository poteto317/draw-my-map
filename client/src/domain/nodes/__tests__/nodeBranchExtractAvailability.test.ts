import {
  resolveBranchExtractContextMenu,
  type BranchExtractContextMenuInput,
} from "@/domain/nodes/nodeBranchExtractAvailability";
import { createTestNode } from "@/testing/createTestNode";

const baseNodes = [
  createTestNode({ id: 1, parentId: null, label: "ルート" }),
  createTestNode({ id: 2, parentId: 1, label: "枝" }),
  createTestNode({ id: 3, parentId: 2, label: "子" }),
];

function input(overrides: Partial<BranchExtractContextMenuInput> = {}): BranchExtractContextMenuInput {
  return {
    viewMode: "map",
    selectedNodeId: 2,
    selectedNodeIds: [2],
    nodes: baseNodes,
    contextMenuNodeId: 2,
    isProtectedMode: false,
    hasConflict: false,
    isExternallyDeleted: false,
    ...overrides,
  };
}

describe("resolveBranchExtractContextMenu", () => {
  it("マップ表示・主選択1・非ルート・コンテキスト対象が一致すると表示する", () => {
    expect(resolveBranchExtractContextMenu(input())).toEqual({
      visible: true,
      disabled: false,
    });
  });

  it("アウトライン表示では非表示", () => {
    expect(resolveBranchExtractContextMenu(input({ viewMode: "outline" })).visible).toBe(false);
  });

  it("主選択が無い・複数選択では非表示", () => {
    expect(resolveBranchExtractContextMenu(input({ selectedNodeId: null, selectedNodeIds: [] })).visible).toBe(false);
    expect(resolveBranchExtractContextMenu(input({ selectedNodeIds: [2, 3] })).visible).toBe(false);
  });

  it("ルートでは非表示", () => {
    expect(resolveBranchExtractContextMenu(input({
      selectedNodeId: 1,
      selectedNodeIds: [1],
      contextMenuNodeId: 1,
    })).visible).toBe(false);
  });

  it("メニュー対象が主選択と一致しないときは非表示", () => {
    expect(resolveBranchExtractContextMenu(input({ contextMenuNodeId: 3 })).visible).toBe(false);
  });

  it("保護・競合・外部削除では disabled", () => {
    expect(resolveBranchExtractContextMenu(input({ isProtectedMode: true })).disabled).toBe(true);
    expect(resolveBranchExtractContextMenu(input({ hasConflict: true })).disabled).toBe(true);
    expect(resolveBranchExtractContextMenu(input({ isExternallyDeleted: true })).disabled).toBe(true);
  });

  it("枝内または離脱元親が locked なら disabled", () => {
    const leaf = createTestNode({ id: 3, parentId: 2, label: "子" });
    const lockedParent = createTestNode({ id: 2, parentId: 1, label: "中間", locked: true });
    expect(resolveBranchExtractContextMenu(input({
      nodes: [baseNodes[0], lockedParent, leaf],
      selectedNodeId: 3,
      selectedNodeIds: [3],
      contextMenuNodeId: 3,
    })).disabled).toBe(true);

    const lockedBranch = createTestNode({ id: 2, parentId: 1, label: "枝", locked: true });
    expect(resolveBranchExtractContextMenu(input({
      nodes: [baseNodes[0], lockedBranch, baseNodes[2]],
    })).disabled).toBe(true);
  });

  it("ルート直下の枝は親 locked を検査しない", () => {
    const lockedRoot = createTestNode({ id: 1, parentId: null, label: "ルート", locked: true });
    const underRoot = createTestNode({ id: 2, parentId: 1, label: "直下" });
    expect(resolveBranchExtractContextMenu(input({
      nodes: [lockedRoot, underRoot],
      selectedNodeId: 2,
      selectedNodeIds: [2],
      contextMenuNodeId: 2,
    })).disabled).toBe(false);
  });

  it("libraryMetaStatus は関与しない（呼び出し側で渡さない）", () => {
    expect(resolveBranchExtractContextMenu(input()).disabled).toBe(false);
  });
});