import { buildNodeForestRelations } from "@/domain/nodes/nodeLayoutForestRelations";
import { layoutNodeForest } from "@/domain/nodes/nodeAutoLayout";
import {
  canInsertParentNode,
  insertParentNode,
} from "@/domain/nodes/nodeParentInsertion";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

function n(id: number, parentId: number | null, x = 0, y = 0, extra: Partial<Node> = {}): Node {
  return createTestNode({ id, parentId, x, y, ...extra });
}

function all(nodes: readonly Node[]): Set<number> {
  return new Set(nodes.map((node) => node.id));
}

function pairs(nodes: readonly Node[]): (number | null)[][] {
  return nodes.map((node) => [node.id, node.parentId]);
}

function succeed(
  nodes: readonly Node[],
  nodeId: number,
  visible: ReadonlySet<number> = all(nodes),
  mode: "manual" | "auto" = "auto",
  newNodeId = 50,
) {
  const result = insertParentNode(nodes, nodeId, newNodeId, visible, mode);
  if (!result.ok) throw new Error(`failed: ${result.reason}`);
  return result;
}

function byId(nodes: readonly Node[], id: number): Node {
  const found = nodes.find((node) => node.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

function childIds(nodes: readonly Node[], parentId: number): number[] {
  return buildNodeForestRelations(nodes)!
    .childrenByParent.get(parentId)!
    .map((node) => node.id);
}

describe("canInsertParentNode", () => {
  const nodes = [n(1, null), n(2, 1), n(4, 1)];

  it("is false without a target", () => {
    expect(canInsertParentNode(nodes, null, all(nodes))).toBe(false);
  });

  it("is true for a visible node and for a root", () => {
    expect(canInsertParentNode(nodes, 4, all(nodes))).toBe(true);
    expect(canInsertParentNode(nodes, 1, all(nodes))).toBe(true);
  });

  it("is false for a missing node even if it is in the visible set", () => {
    expect(canInsertParentNode(nodes, 99, new Set([1, 2, 4, 99]))).toBe(false);
  });

  it("is false for a hidden node", () => {
    expect(canInsertParentNode(nodes, 4, new Set([1, 2]))).toBe(false);
  });

  it("scans the array at most once", () => {
    let reads = 0;
    const proxy = new Proxy(nodes, {
      get(target, prop, receiver) {
        if (typeof prop === "string" && /^\d+$/.test(prop)) reads += 1;
        return Reflect.get(target, prop, receiver);
      },
    });
    canInsertParentNode(proxy, 99, all(nodes).add(99));
    expect(reads).toBeLessThanOrEqual(nodes.length);
  });
});

describe("insertParentNode arrays", () => {
  it("P1: puts N where T was and keeps later siblings", () => {
    const nodes = [n(1, null), n(2, 1), n(4, 1), n(3, 1)];
    const result = succeed(nodes, 4);
    expect(pairs(result.nodes)).toEqual([[1, null], [2, 1], [50, 1], [4, 50], [3, 1]]);
    expect(result.insertedId).toBe(50);
    expect(childIds(result.nodes, 1)).toEqual([2, 50, 3]);
    expect(childIds(result.nodes, 50)).toEqual([4]);
  });

  it("P2: keeps the descendants after T", () => {
    const nodes = [n(1, null), n(4, 1), n(6, 4), n(2, 1)];
    expect(pairs(succeed(nodes, 4).nodes)).toEqual([
      [1, null], [50, 1], [4, 50], [6, 4], [2, 1],
    ]);
  });

  it("P3: keeps the descendants before T", () => {
    const nodes = [n(1, null), n(6, 4), n(4, 1), n(2, 1)];
    expect(pairs(succeed(nodes, 4).nodes)).toEqual([
      [1, null], [6, 4], [50, 1], [4, 50], [2, 1],
    ]);
  });

  it("P4: inserts above a middle root", () => {
    const nodes = [n(1, null), n(4, null), n(8, null)];
    const result = succeed(nodes, 4);
    expect(pairs(result.nodes)).toEqual([[1, null], [50, null], [4, 50], [8, null]]);
    expect(buildNodeForestRelations(result.nodes)!.roots.map((r) => r.id)).toEqual([1, 50, 8]);
  });

  it("P5: inserts above the first root", () => {
    const nodes = [n(4, null), n(8, null)];
    const result = succeed(nodes, 4);
    expect(pairs(result.nodes)).toEqual([[50, null], [4, 50], [8, null]]);
    expect(buildNodeForestRelations(result.nodes)!.roots.map((r) => r.id)).toEqual([50, 8]);
  });

  it("P6: keeps a hidden sibling", () => {
    const nodes = [n(1, null), n(7, 1), n(4, 1), n(3, 1)];
    const result = succeed(nodes, 4, new Set([1, 4, 3]));
    expect(pairs(result.nodes)).toEqual([[1, null], [7, 1], [50, 1], [4, 50], [3, 1]]);
    expect(childIds(result.nodes, 1)).toEqual([7, 50, 3]);
  });

  it("P7: works when the descendants are hidden", () => {
    const nodes = [n(1, null), n(4, 1), n(6, 4)];
    expect(pairs(succeed(nodes, 4, new Set([1, 4])).nodes)).toEqual([
      [1, null], [50, 1], [4, 50], [6, 4],
    ]);
  });

  it("P8: rejects a hidden target", () => {
    const nodes = [n(1, null), n(4, 1)];
    expect(insertParentNode(nodes, 4, 50, new Set([1]), "auto")).toEqual({
      ok: false,
      reason: "node-hidden",
    });
  });

  it("P9: rejects a target whose parent is missing", () => {
    const nodes = [n(4, 99)];
    expect(insertParentNode(nodes, 4, 50, all(nodes), "auto")).toEqual({
      ok: false,
      reason: "invalid-structure",
    });
  });
});

describe("insertParentNode identity", () => {
  it("reuses untouched nodes and does not mutate the input", () => {
    const nodes = [n(1, null), n(4, 1), n(6, 4), n(2, 1)];
    const before = JSON.parse(JSON.stringify(nodes));
    const result = succeed(nodes, 4);
    expect(byId(result.nodes, 1)).toBe(nodes[0]);
    expect(byId(result.nodes, 6)).toBe(nodes[2]);
    expect(byId(result.nodes, 2)).toBe(nodes[3]);
    const t = byId(result.nodes, 4);
    expect(t).not.toBe(nodes[1]);
    expect(t).toEqual({ ...nodes[1], parentId: 50 });
    expect(nodes).toEqual(before);
  });
});

describe("insertParentNode failures", () => {
  it("rejects a missing node", () => {
    const nodes = [n(1, null)];
    expect(insertParentNode(nodes, 77, 50, all(nodes), "auto")).toEqual({
      ok: false,
      reason: "node-missing",
    });
  });

  it("rejects a node that is its own parent", () => {
    const nodes = [n(4, 4)];
    expect(insertParentNode(nodes, 4, 50, all(nodes), "auto")).toEqual({
      ok: false,
      reason: "invalid-structure",
    });
  });

  it("rejects a conflicting new id", () => {
    const nodes = [n(1, null), n(2, 1), n(4, 1), n(3, 1)];
    expect(insertParentNode(nodes, 4, 2, all(nodes), "auto")).toEqual({
      ok: false,
      reason: "id-conflict",
    });
  });

  it("checks hidden before id conflict", () => {
    const nodes = [n(1, null), n(4, 1)];
    expect(insertParentNode(nodes, 4, 1, new Set([1]), "auto")).toEqual({
      ok: false,
      reason: "node-hidden",
    });
  });

  it("checks invalid structure before id conflict", () => {
    const nodes = [n(4, 99), n(2, null)];
    expect(insertParentNode(nodes, 4, 2, all(nodes), "auto")).toEqual({
      ok: false,
      reason: "invalid-structure",
    });
  });
});

describe("insertParentNode new node values", () => {
  const rich = (importance: Node["importance"], parentId: number | null = 1) =>
    n(4, parentId, 220, 100, {
      width: 140,
      height: 116,
      label: "T",
      importance,
      illustration: "data:image/png;base64,AAAA",
    });

  it("uses the target position and importance with default size", () => {
    const t = rich("high");
    const nodes = [n(1, null), n(2, 1), t, n(3, 1)];
    const result = succeed(nodes, 4);
    const created = byId(result.nodes, 50);
    expect(created).toEqual({
      id: 50,
      parentId: 1,
      x: 220,
      y: 100,
      width: 100,
      height: 60,
      label: "",
      importance: "high",
    });
    expect("illustration" in created).toBe(false);
    const moved = byId(result.nodes, 4);
    expect(moved.width).toBe(140);
    expect(moved.height).toBe(116);
    expect(moved.illustration).toBe("data:image/png;base64,AAAA");
    expect(moved.importance).toBe("high");
  });

  it("copies a low importance", () => {
    const nodes = [n(1, null), rich("low")];
    expect(byId(succeed(nodes, 4).nodes, 50).importance).toBe("low");
  });

  it("keeps a null parent for a root target", () => {
    const nodes = [rich("high", null)];
    expect(byId(succeed(nodes, 4).nodes, 50).parentId).toBeNull();
  });
});

describe("insertParentNode manual placement", () => {
  const pos = (nodes: readonly Node[], id: number) => {
    const node = byId(nodes, id);
    return [node.x, node.y];
  };

  const m1 = () => [
    n(1, null, 0, 0),
    n(2, 1, 220, 0),
    n(4, 1, 220, 100),
    n(3, 1, 220, 200),
    n(6, 4, 440, 100),
  ];

  it("M1: puts N at T, and moves T and its descendants one level right", () => {
    const nodes = m1();
    const result = succeed(nodes, 4, all(nodes), "manual");
    expect(pos(result.nodes, 50)).toEqual([220, 100]);
    expect(pos(result.nodes, 4)).toEqual([440, 100]);
    expect(pos(result.nodes, 6)).toEqual([660, 100]);
    expect(byId(result.nodes, 1)).toBe(nodes[0]);
    expect(byId(result.nodes, 2)).toBe(nodes[1]);
    expect(byId(result.nodes, 3)).toBe(nodes[3]);
  });

  it("M1: also moves hidden descendants of a closed T", () => {
    const nodes = m1();
    const result = succeed(nodes, 4, new Set([1, 2, 4, 3]), "manual");
    expect(pos(result.nodes, 6)).toEqual([660, 100]);
  });

  it("M2: ignores the size of T for positions", () => {
    const nodes = m1();
    nodes[2] = n(4, 1, 220, 100, { width: 140, height: 116 });
    const result = succeed(nodes, 4, all(nodes), "manual");
    const created = byId(result.nodes, 50);
    expect([created.x, created.y, created.width, created.height]).toEqual([220, 100, 100, 60]);
    expect(pos(result.nodes, 4)).toEqual([440, 100]);
    expect(pos(result.nodes, 6)).toEqual([660, 100]);
  });

  it("M3: does not avoid overlaps", () => {
    const nodes = [
      n(1, null, 0, 0),
      n(2, 1, 220, 0),
      n(5, 2, 440, 0),
      n(9, 2, 440, 100),
      n(4, 1, 220, 100),
    ];
    const result = succeed(nodes, 4, all(nodes), "manual");
    expect(pos(result.nodes, 4)).toEqual([440, 100]);
    expect(byId(result.nodes, 5)).toBe(nodes[2]);
    expect(byId(result.nodes, 9)).toBe(nodes[3]);
  });

  it("M4: keeps the relative offsets of the descendants", () => {
    const nodes = [n(1, null, 0, 0), n(4, 1, 220, 100), n(6, 4, 440, 50), n(10, 4, 440, 150)];
    const result = succeed(nodes, 4, all(nodes), "manual");
    expect(pos(result.nodes, 4)).toEqual([440, 100]);
    expect(pos(result.nodes, 6)).toEqual([660, 50]);
    expect(pos(result.nodes, 10)).toEqual([660, 150]);
  });

  it("M5a: fails when the coordinates overflow in precision", () => {
    const nodes = [n(1, null, 0, 0), n(4, 1, 1e19, 100)];
    expect(insertParentNode(nodes, 4, 50, all(nodes), "manual")).toEqual({
      ok: false,
      reason: "placement-failed",
    });
  });

  it("M5b: fails when a descendant overflows", () => {
    const nodes = [
      n(1, null, -220, 0),
      n(4, 1, 0, 0),
      n(6, 4, Number.MAX_VALUE, 0),
    ];
    expect(insertParentNode(nodes, 4, 50, all(nodes), "manual")).toEqual({
      ok: false,
      reason: "placement-failed",
    });
  });

  it("M6: fails for non-finite coordinates", () => {
    const a = [n(1, null, 0, 0), n(4, 1, 220, Number.NaN)];
    const b = [n(1, null, 0, 0), n(4, 1, Number.NaN, 100)];
    expect(insertParentNode(a, 4, 50, all(a), "manual")).toEqual({
      ok: false,
      reason: "placement-failed",
    });
    expect(insertParentNode(b, 4, 50, all(b), "manual")).toEqual({
      ok: false,
      reason: "placement-failed",
    });
  });
});

describe("insertParentNode auto placement", () => {
  it("leaves every coordinate alone and places N at T", () => {
    const nodes = [n(1, null, 30, 40), n(2, 1, 500, 500), n(4, 1, 37, -80), n(6, 4, 9, 9)];
    const result = succeed(nodes, 4);
    for (const node of nodes) {
      const after = byId(result.nodes, node.id);
      expect([after.x, after.y]).toEqual([node.x, node.y]);
    }
    const created = byId(result.nodes, 50);
    expect([created.x, created.y]).toEqual([37, -80]);
  });

  it("carries the first root's position over to N when T is the first root", () => {
    const nodes = [n(4, null, 30, 40), n(6, 4, 0, 0), n(8, null, 500, 500)];
    const result = succeed(nodes, 4);
    const laidOut = layoutNodeForest(result.nodes)!;
    const created = byId(laidOut, 50);
    expect([created.x, created.y]).toEqual([30, 40]);
  });

  it("keeps the first root's position when T is not the first root", () => {
    const nodes = [n(1, null, 30, 40), n(2, 1, 0, 0), n(4, 1, 0, 0)];
    const result = succeed(nodes, 4);
    expect(result.nodes[0]).toBe(nodes[0]);
    const laidOut = layoutNodeForest(result.nodes)!;
    const root = byId(laidOut, 1);
    expect([root.x, root.y]).toEqual([30, 40]);
  });
});
