import { scanSiblingNeighbors } from "@/domain/nodes/nodeSiblingNeighbors";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

const R = 1;

// 親 R（id 1）の子として ids を並べ、hidden の ID だけ見えないことにする
function siblings(ids: readonly number[], hidden: readonly number[] = []) {
  const nodes: Node[] = [
    createTestNode({ id: R }),
    ...ids.map((id) => createTestNode({ id, parentId: R, x: 220, y: 0 })),
  ];
  const visibleNodeIds = new Set(nodes.map((node) => node.id));
  for (const id of hidden) visibleNodeIds.delete(id);
  return { nodes, visibleNodeIds };
}

describe("scanSiblingNeighbors", () => {
  it("全件見えているとき、前後の見えている兄弟を返す", () => {
    const { nodes, visibleNodeIds } = siblings([2, 3, 4, 5]);
    const scan = scanSiblingNeighbors(nodes, 4, visibleNodeIds);
    expect(scan).toEqual({
      kind: "found",
      neighbors: {
        node: nodes[3],
        previousVisibleId: 3,
        hiddenBefore: false,
        nextVisibleId: 5,
        hiddenAfter: false,
      },
    });
    if (scan.kind !== "found") throw new Error("found ではない");
    expect(scan.neighbors.node).toBe(nodes[3]);
  });

  it("隠れた兄弟を飛ばして見えている兄弟を返し、両側に隠れた兄弟があると記録する", () => {
    const { nodes, visibleNodeIds } = siblings([2, 7, 4, 11, 5], [7, 11]);
    const scan = scanSiblingNeighbors(nodes, 4, visibleNodeIds);
    expect(scan).toMatchObject({
      kind: "found",
      neighbors: {
        previousVisibleId: 2,
        hiddenBefore: true,
        nextVisibleId: 5,
        hiddenAfter: true,
      },
    });
  });

  it("先頭の兄弟では前の兄弟が無い", () => {
    const { nodes, visibleNodeIds } = siblings([4, 2]);
    expect(scanSiblingNeighbors(nodes, 4, visibleNodeIds)).toMatchObject({
      kind: "found",
      neighbors: { previousVisibleId: null, hiddenBefore: false, nextVisibleId: 2 },
    });
  });

  it("前に隠れた兄弟だけがあるとき、previousVisibleId は null で hiddenBefore は true", () => {
    const { nodes, visibleNodeIds } = siblings([7, 4], [7]);
    expect(scanSiblingNeighbors(nodes, 4, visibleNodeIds)).toMatchObject({
      kind: "found",
      neighbors: { previousVisibleId: null, hiddenBefore: true },
    });
  });

  it("別の親の子が T の前に混ざっていても兄弟として数えない", () => {
    const nodes: Node[] = [
      createTestNode({ id: R }),
      createTestNode({ id: 10, parentId: 99 }),
      createTestNode({ id: 4, parentId: R }),
    ];
    const visibleNodeIds = new Set(nodes.map((node) => node.id));
    expect(scanSiblingNeighbors(nodes, 4, visibleNodeIds)).toMatchObject({
      kind: "found",
      neighbors: { previousVisibleId: null, hiddenBefore: false },
    });
  });

  it("別の親の子が T の後ろに混ざっていても次の兄弟として数えない", () => {
    const nodes: Node[] = [
      createTestNode({ id: R }),
      createTestNode({ id: 4, parentId: R }),
      createTestNode({ id: 10, parentId: 99 }),
    ];
    const visibleNodeIds = new Set(nodes.map((node) => node.id));
    expect(scanSiblingNeighbors(nodes, 4, visibleNodeIds)).toMatchObject({
      kind: "found",
      neighbors: { nextVisibleId: null, hiddenAfter: false },
    });
  });

  it("ルート同士は parentId が null の兄弟として扱う", () => {
    const nodes: Node[] = [createTestNode({ id: 1 }), createTestNode({ id: 8 })];
    const visibleNodeIds = new Set([1, 8]);
    expect(scanSiblingNeighbors(nodes, 8, visibleNodeIds)).toMatchObject({
      kind: "found",
      neighbors: { previousVisibleId: 1 },
    });
  });

  it("T が無いとき node-missing を返す", () => {
    const { nodes, visibleNodeIds } = siblings([2, 3]);
    expect(scanSiblingNeighbors(nodes, 4, visibleNodeIds)).toEqual({ kind: "node-missing" });
  });

  it("T が隠れているとき node-hidden を返す", () => {
    const { nodes, visibleNodeIds } = siblings([2, 4, 3], [4]);
    expect(scanSiblingNeighbors(nodes, 4, visibleNodeIds)).toEqual({ kind: "node-hidden" });
  });
});
