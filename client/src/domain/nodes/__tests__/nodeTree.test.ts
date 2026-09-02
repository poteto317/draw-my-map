import { collectSubtreeIds } from "@/domain/nodes/nodeTree";
import type { Node } from "@/types/node";

function node(id: number, parentId: number | null): Node {
  return {
    id,
    parentId,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    label: "",
  };
}

describe("collectSubtreeIds", () => {
  it("includes a requested root even when it is absent", () => {
    expect(collectSubtreeIds([], 10)).toEqual(new Set([10]));
  });

  it("collects a deep chain of descendants", () => {
    expect(collectSubtreeIds([
      node(1, null),
      node(2, 1),
      node(3, 2),
      node(4, 3),
    ], 1)).toEqual(new Set([1, 2, 3, 4]));
  });

  it("collects branching descendants", () => {
    expect(collectSubtreeIds([
      node(1, null),
      node(2, 1),
      node(3, 1),
      node(4, 2),
    ], 1)).toEqual(new Set([1, 2, 3, 4]));
  });

  it("excludes unrelated roots and orphan nodes", () => {
    expect(collectSubtreeIds([
      node(1, null),
      node(2, 1),
      node(9, null),
      node(10, 999),
    ], 1)).toEqual(new Set([1, 2]));
  });

  it("terminates and collects every reachable node in a malformed cycle", () => {
    expect(collectSubtreeIds([
      node(1, 3),
      node(2, 1),
      node(3, 2),
    ], 1)).toEqual(new Set([1, 2, 3]));
  });
});
