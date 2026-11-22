import { normalizeExportForestParents } from "@/domain/exportScope/normalizeExportForestParents";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

function node(id: number, parentId: number | null, overrides: Partial<Node> = {}): Node {
  return createTestNode({ id, parentId, label: `n${id}`, ...overrides });
}

describe("normalizeExportForestParents", () => {
  it("集合内に親があるノードはそのまま", () => {
    const nodes = [node(1, null), node(2, 1), node(3, 2)];
    expect(normalizeExportForestParents(nodes)).toEqual(nodes);
  });

  it("集合外の親を持つノードは parentId を null にする", () => {
    const child = node(2, 1);
    const grandchild = node(3, 2);
    expect(normalizeExportForestParents([child, grandchild])).toEqual([
      { ...child, parentId: null },
      grandchild,
    ]);
  });

  it("すでに根のノードは変えない", () => {
    const root = node(5, null);
    expect(normalizeExportForestParents([root])).toEqual([root]);
  });

  it("元の配列と要素を mutate しない", () => {
    const child = node(2, 1);
    const input = [child];
    const result = normalizeExportForestParents(input);
    expect(result).not.toBe(input);
    expect(result[0]).not.toBe(child);
    expect(child.parentId).toBe(1);
    expect(result[0]!.parentId).toBeNull();
  });
});
