import {
  forestRootNodes,
  preOrderClosedForest,
  sortedChildNodes,
} from "@/domain/exchange/closedNodeForest";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

function node(id: number, parentId: number | null): Node {
  return createTestNode({ id, parentId, label: `L${id}` });
}

describe("closedNodeForest", () => {
  it("forestRootNodes は集合外の親を持つノードをルートにする", () => {
    const nodes = [node(2, 1), node(3, 2)];
    expect(forestRootNodes(nodes).map((n) => n.id)).toEqual([2]);
  });

  it("sortedChildNodes は配列順で兄弟を並べる", () => {
    const nodes = [node(1, null), node(3, 1), node(2, 1)];
    expect(sortedChildNodes(1, nodes).map((n) => n.id)).toEqual([3, 2]);
  });

  it("preOrderClosedForest はルートから深さ優先に並べる", () => {
    const nodes = [
      node(10, null),
      node(20, 10),
      node(30, 20),
      node(11, null),
      node(21, 11),
    ];
    expect(preOrderClosedForest(nodes).map((n) => n.id)).toEqual([10, 20, 30, 11, 21]);
  });
});