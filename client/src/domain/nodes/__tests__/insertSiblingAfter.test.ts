import { directChildIdsInArrayOrder } from "@/domain/nodes/reorderAllSiblings";
import { insertSiblingAfter } from "@/domain/nodes/insertSiblingAfter";
import { DEFAULT_LAYOUT_NODE_FOREST_OPTIONS } from "@/domain/nodes/nodeAutoLayout";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

function family(): Node[] {
  return [
    createTestNode({ id: 1, label: "根" }),
    createTestNode({ id: 2, parentId: 1, label: "A", x: 100, y: 80 }),
    createTestNode({ id: 3, parentId: 1, label: "B", x: 100, y: 160 }),
  ];
}

describe("insertSiblingAfter", () => {
  it("基準ノードの直後に兄弟を挿入する（末尾ではない）", () => {
    const nodes = family();
    const result = insertSiblingAfter(nodes, 2, 9, "新", "manual", undefined, DEFAULT_LAYOUT_NODE_FOREST_OPTIONS);
    if (!result.ok) throw new Error(result.reason);
    expect(result.nodes.map((node) => node.id)).toEqual([1, 2, 9, 3]);
    expect(directChildIdsInArrayOrder(result.nodes, 1)).toEqual([2, 9, 3]);
    expect(result.nodes.find((node) => node.id === 9)?.label).toBe("新");
  });
});