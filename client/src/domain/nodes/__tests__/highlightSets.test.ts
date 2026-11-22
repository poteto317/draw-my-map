import {
  collectHighlightNodeIds,
  type HighlightMode,
} from "@/domain/nodes/highlightSets";
import { createTestNode } from "@/testing/createTestNode";

function sorted(ids: ReadonlySet<number>): number[] {
  return [...ids].sort((a, b) => a - b);
}

describe("collectHighlightNodeIds", () => {
  const nodes = [
    createTestNode({ id: 1, parentId: null }),
    createTestNode({ id: 2, parentId: 1 }),
    createTestNode({ id: 3, parentId: 2 }),
    createTestNode({ id: 4, parentId: null }),
    createTestNode({ id: 5, parentId: 4 }),
  ];
  const allVisible = new Set([1, 2, 3, 4, 5]);

  it.each([
    "off",
    "search",
    "selection",
  ] as const satisfies readonly HighlightMode[])("mode=%s で off 相当の空入力は空集合", (mode) => {
    if (mode === "off") {
      expect(sorted(collectHighlightNodeIds(
        mode,
        new Set([1, 2]),
        new Set([1]),
        nodes,
        allVisible,
      ))).toEqual([]);
      return;
    }
    expect(sorted(collectHighlightNodeIds(
      mode,
      new Set(),
      new Set(),
      nodes,
      allVisible,
    ))).toEqual([]);
  });

  it("search は hit ∩ visible のみ", () => {
    expect(sorted(collectHighlightNodeIds(
      "search",
      new Set([2, 3, 5]),
      new Set([1]),
      nodes,
      new Set([1, 2, 4]),
    ))).toEqual([2]);
  });

  it("selection は選択各 ID の部分木の和", () => {
    expect(sorted(collectHighlightNodeIds(
      "selection",
      new Set([99]),
      new Set([2, 4]),
      nodes,
      allVisible,
    ))).toEqual([2, 3, 4, 5]);
  });

  it("selection で選択 0 件なら空（全ノード通常 alpha 用）", () => {
    expect(sorted(collectHighlightNodeIds(
      "selection",
      new Set([1]),
      new Set(),
      nodes,
      allVisible,
    ))).toEqual([]);
  });
});
