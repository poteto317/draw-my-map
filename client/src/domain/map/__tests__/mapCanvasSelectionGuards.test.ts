import {
  groupSelection,
  isNodeTargetOperationBlocked,
  nodesSelection,
  relationSelection,
  selectedGroupId,
  selectedRelationId,
} from "@/domain/map/mapCanvasSelectionGuards";

describe("mapCanvasSelectionGuards", () => {
  it("relation / group 選択中はノード対象操作をブロックする", () => {
    expect(isNodeTargetOperationBlocked(relationSelection(10))).toBe(true);
    expect(isNodeTargetOperationBlocked(groupSelection(20))).toBe(true);
    expect(isNodeTargetOperationBlocked(nodesSelection([1, 2]))).toBe(false);
    expect(isNodeTargetOperationBlocked(null)).toBe(false);
  });

  it("selectedRelationId / selectedGroupId を取り出す", () => {
    expect(selectedRelationId(relationSelection(10))).toBe(10);
    expect(selectedRelationId(nodesSelection([1]))).toBeNull();
    expect(selectedGroupId(groupSelection(20))).toBe(20);
    expect(selectedGroupId(relationSelection(10))).toBeNull();
  });
});
