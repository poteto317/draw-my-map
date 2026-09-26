import {
  canConnectNodes,
  collectSubtreeIds,
  connectNodeTree,
  moveNodeSubtree,
} from "@/domain/nodes/nodeTree";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";

function node(id: number, parentId: number | null, x = 0, y = 0): Node {
  return createTestNode({ id, parentId, x, y, width: 1, height: 1 });
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

describe("canConnectNodes", () => {
  const nodes = [
    node(1, null),
    node(2, 1),
    node(3, 2),
    node(4, null),
  ];

  it("allows an existing node to become the parent of an unrelated node", () => {
    expect(canConnectNodes(nodes, 4, 2)).toBe(true);
  });

  it("rejects a connection when either endpoint is missing", () => {
    expect(canConnectNodes(nodes, 99, 2)).toBe(false);
    expect(canConnectNodes(nodes, 1, 99)).toBe(false);
  });

  it("rejects connecting a node to itself", () => {
    expect(canConnectNodes(nodes, 2, 2)).toBe(false);
  });

  it("rejects making a descendant the parent of its ancestor", () => {
    expect(canConnectNodes(nodes, 3, 1)).toBe(false);
  });

  it("inspects a reverse-ordered deep tree in linear time", () => {
    const nodeCount = 100;
    const deepTree = Array.from(
      { length: nodeCount },
      (_, index) => node(nodeCount - index, nodeCount - index === 1 ? null : nodeCount - index - 1),
    );
    let nodeReads = 0;
    const observedTree = new Proxy(deepTree, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) nodeReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });

    expect(canConnectNodes(observedTree, nodeCount, 1)).toBe(false);
    expect(nodeReads).toBeLessThanOrEqual(nodeCount * 2);
  });

  it("rejects connecting beneath a malformed cyclic parent chain", () => {
    const malformedNodes = [
      node(1, 2),
      node(2, 1),
      node(3, null),
    ];

    expect(canConnectNodes(malformedNodes, 1, 3)).toBe(false);
  });
});

describe("connectNodeTree", () => {
  it("reparents only the requested child and preserves other node references", () => {
    const parent = node(1, null);
    const child = node(2, 1);
    const newParent = node(3, null);
    const nodes = [parent, child, newParent];

    const connected = connectNodeTree(nodes, 3, 2);

    expect(connected).not.toBeNull();
    expect(connected?.[0]).toBe(parent);
    expect(connected?.[1]).toEqual({ ...child, parentId: 3 });
    expect(connected?.[1]).not.toBe(child);
    expect(connected?.[2]).toBe(newParent);
    expect(nodes[1].parentId).toBe(1);
  });

  it.each([
    [2, 2],
    [2, 1],
    [99, 2],
    [1, 99],
  ])("returns null without mutating input for invalid connection %s -> %s", (
    parentId,
    childId,
  ) => {
    const nodes = [node(1, null), node(2, 1)];
    const snapshot = nodes.map((current) => ({ ...current }));

    expect(connectNodeTree(nodes, parentId, childId)).toBeNull();
    expect(nodes).toEqual(snapshot);
  });
});

describe("moveNodeSubtree", () => {
  it("ルートと深い子孫へ同じ差分を適用する", () => {
    const nodes = [
      node(1, null, 10, 20),
      node(2, 1, 30, 40),
      node(3, 2, 80, 90),
    ];

    expect(moveNodeSubtree(nodes, 1, 25, 45)).toEqual([
      node(1, null, 25, 45),
      node(2, 1, 45, 65),
      node(3, 2, 95, 115),
    ]);
    expect(nodes.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 80, y: 90 },
    ]);
  });

  it("中間ノードの部分木だけを移動し無関係な参照を維持する", () => {
    const root = node(1, null, 0, 0);
    const branch = node(2, 1, 20, 20);
    const leaf = node(3, 2, 40, 40);
    const sibling = node(4, 1, 20, 100);

    const moved = moveNodeSubtree([root, branch, leaf, sibling], 2, 30, 35)!;

    expect(moved[0]).toBe(root);
    expect(moved[1]).toEqual({ ...branch, x: 30, y: 35 });
    expect(moved[2]).toEqual({ ...leaf, x: 50, y: 55 });
    expect(moved[3]).toBe(sibling);
  });

  it("葉ノードだけを移動する", () => {
    const root = node(1, null, 0, 0);
    const leaf = node(2, 1, 20, 20);
    const moved = moveNodeSubtree([root, leaf], 2, 50, 60)!;

    expect(moved[0]).toBe(root);
    expect(moved[1]).toEqual({ ...leaf, x: 50, y: 60 });
  });

  it("欠損ノードと非有限座標を拒否する", () => {
    const nodes = [node(1, null)];
    expect(moveNodeSubtree(nodes, 99, 1, 1)).toBeNull();
    expect(moveNodeSubtree(nodes, 1, Number.NaN, 1)).toBeNull();
    expect(moveNodeSubtree(nodes, 1, 1, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("有限な移動先でも差分が非有限になる場合は拒否する", () => {
    expect(moveNodeSubtree([node(1, null, -Number.MAX_VALUE, 0)], 1, Number.MAX_VALUE, 0)).toBeNull();
    expect(moveNodeSubtree([node(1, null, 0, -Number.MAX_VALUE)], 1, 0, Number.MAX_VALUE)).toBeNull();
  });

  it("子孫の算出座標が非有限になる場合は部分木全体を拒否する", () => {
    expect(moveNodeSubtree([
      node(1, null, 0, 0),
      node(2, 1, Number.MAX_VALUE, 0),
    ], 1, Number.MAX_VALUE, 0)).toBeNull();
    expect(moveNodeSubtree([
      node(1, null, 0, 0),
      node(2, 1, 0, Number.MAX_VALUE),
    ], 1, 0, Number.MAX_VALUE)).toBeNull();
  });

  it("ゼロ差分では新しい配列と既存node参照を返す", () => {
    const root = node(1, null, 10, 20);
    const child = node(2, 1, 30, 40);
    const nodes = [root, child];

    const moved = moveNodeSubtree(nodes, 1, 10, 20)!;

    expect(moved).not.toBe(nodes);
    expect(moved[0]).toBe(root);
    expect(moved[1]).toBe(child);
  });

  it("循環を有限回で処理し到達ノードを一度ずつ移動する", () => {
    const cyclic = [
      node(1, 3, 0, 0),
      node(2, 1, 10, 10),
      node(3, 2, 20, 20),
      node(4, null, 100, 100),
    ];

    expect(moveNodeSubtree(cyclic, 1, 5, 5)).toEqual([
      node(1, 3, 5, 5),
      node(2, 1, 15, 15),
      node(3, 2, 25, 25),
      cyclic[3],
    ]);
  });

  it("逆順の深いツリーを線形回数の配列読み取りで移動する", () => {
    const count = 100;
    const deepTree = Array.from(
      { length: count },
      (_, index) => {
        const id = count - index;
        return node(id, id === 1 ? null : id - 1, id, id);
      },
    );
    let reads = 0;
    const observed = new Proxy(deepTree, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) reads += 1;
        return Reflect.get(target, property, receiver);
      },
    });

    expect(moveNodeSubtree(observed, 1, 20, 20)).not.toBeNull();
    expect(reads).toBeLessThanOrEqual(count * 3);
  });
});
