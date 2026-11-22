import { RECT_HEIGHT } from "@/config/shapes";
import { createChildNode, createSiblingNode } from "@/domain/nodes/nodePlacement";
import { createTestNode } from "@/testing/createTestNode";

describe("createSiblingNode", () => {
  it("マップの siblingGap で兄弟を下に置く", () => {
    const parent = createTestNode({ id: 1, parentId: null, x: 0, y: 0, label: "親" });
    const first = createTestNode({ id: 2, parentId: 1, x: 0, y: 0, label: "1" });
    const nodes = [parent, first];

    const sibling = createSiblingNode(nodes, 2, 3, { childGap: 120, siblingGap: 100 });
    expect(sibling?.y).toBe(first.y + RECT_HEIGHT + 100);
  });
});

describe("createChildNode", () => {
  it("マップの childGap で子を右に置く", () => {
    const parent = createTestNode({ id: 1, parentId: null, x: 0, y: 0, label: "親", width: 100 });
    const child = createChildNode([parent], 1, 2, { childGap: 64, siblingGap: 40 });
    expect(child?.x).toBe(100 + 64);
  });
});