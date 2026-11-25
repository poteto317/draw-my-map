import { directChildIdsInArrayOrder, reorderAllSiblings } from "@/domain/nodes/reorderAllSiblings";
import { DEFAULT_LAYOUT_NODE_FOREST_OPTIONS } from "@/domain/nodes/nodeAutoLayout";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

function family(): Node[] {
  return [
    createTestNode({ id: 1, label: "根" }),
    createTestNode({ id: 2, parentId: 1, label: "A", x: 100, y: 80 }),
    createTestNode({ id: 3, parentId: 1, label: "B", x: 100, y: 160 }),
    createTestNode({ id: 4, parentId: 2, label: "A1", x: 220, y: 80 }),
  ];
}

describe("reorderAllSiblings", () => {
  it("同一親の子を配列順どおりに並べ替える", () => {
    const nodes = family();
    expect(directChildIdsInArrayOrder(nodes, 1)).toEqual([2, 3]);
    const result = reorderAllSiblings(nodes, 1, [3, 2], "manual", DEFAULT_LAYOUT_NODE_FOREST_OPTIONS);
    if (!result.ok) throw new Error(result.reason);
    expect(directChildIdsInArrayOrder(result.nodes, 1)).toEqual([3, 2]);
    expect(result.nodes.map((node) => node.id)).toEqual([1, 3, 2, 4]);
  });

  it("順序が同じなら unchanged", () => {
    const nodes = family();
    expect(reorderAllSiblings(nodes, 1, [2, 3], "manual", DEFAULT_LAYOUT_NODE_FOREST_OPTIONS)).toEqual({
      ok: false,
      reason: "unchanged",
    });
  });
});