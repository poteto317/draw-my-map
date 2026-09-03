import {
  canConnectNodes,
  collectSubtreeIds,
  connectNodeTree,
} from "@/domain/nodes/nodeTree";
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
