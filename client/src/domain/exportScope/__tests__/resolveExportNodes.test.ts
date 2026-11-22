import { resolveExportNodes } from "@/domain/exportScope/resolveExportNodes";
import { resolveSelectionTargetIds } from "@/domain/exportScope/resolveSelectionTargetIds";
import { canUseSelectionScope } from "@/domain/exportScope/exportFormatAvailability";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";

function node(id: number, parentId: number | null = null): Node {
  return createTestNode({ id, parentId, width: 1, height: 1 });
}

describe("resolveSelectionTargetIds", () => {
  it("map では selectedNodeIds をそのまま返す", () => {
    expect(resolveSelectionTargetIds("map", 1, [2, 3])).toEqual([2, 3]);
  });

  it("outline で selectedNodeId があるとき単一配列にする", () => {
    expect(resolveSelectionTargetIds("outline", 5, [1, 2])).toEqual([5]);
  });

  it("outline で selectedNodeId が null のとき空配列", () => {
    expect(resolveSelectionTargetIds("outline", null, [1, 2])).toEqual([]);
  });
});

describe("canUseSelectionScope", () => {
  it("ちょうど 1 件のときだけ true", () => {
    expect(canUseSelectionScope([])).toBe(false);
    expect(canUseSelectionScope([1])).toBe(true);
    expect(canUseSelectionScope([1, 2])).toBe(false);
  });
});

describe("resolveExportNodes", () => {
  const nodes = [
    node(1),
    node(2, 1),
    node(3, 1),
    node(4, 2),
    node(5),
  ];

  it("all は全ノードを返す", () => {
    expect(resolveExportNodes("all", nodes, new Set([1, 2]), [2]).map((n) => n.id)).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it("visible は visibleNodeIds に含まれるノードだけ返す", () => {
    expect(
      resolveExportNodes("visible", nodes, new Set([2, 5, 99]), []).map((n) => n.id),
    ).toEqual([2, 5]);
  });

  it("visible で visibleNodeIds が空なら空配列", () => {
    expect(resolveExportNodes("visible", nodes, new Set(), [1])).toEqual([]);
  });

  it("selection はちょうど 1 件のときその部分木を返す", () => {
    expect(
      resolveExportNodes("selection", nodes, new Set([1, 2, 3, 4, 5]), [2]).map((n) => n.id),
    ).toEqual([2, 4]);
  });

  it("selection で 0 件なら空配列", () => {
    expect(resolveExportNodes("selection", nodes, new Set([1]), [])).toEqual([]);
  });

  it("selection で 2 件以上なら空配列", () => {
    expect(resolveExportNodes("selection", nodes, new Set([1]), [1, 5])).toEqual([]);
  });

  it("selection の部分木は元の nodes の順序を保つ", () => {
    expect(
      resolveExportNodes("selection", nodes, new Set(), [1]).map((n) => n.id),
    ).toEqual([1, 2, 3, 4]);
  });
});
