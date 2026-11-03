import { buildOutlineRows } from "@/domain/outline/outlineRows";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

function node(id: number, parentId: number | null, overrides: Partial<Node> = {}): Node {
  return createTestNode({ id, parentId, ...overrides });
}

describe("buildOutlineRows", () => {
  it("keepsRootAndSiblingArrayOrder", () => {
    const nodes = Object.freeze([
      Object.freeze(node(3, 1, { label: "同名", x: 31, y: -20, width: 180, height: 90, importance: "high", illustration: "data:image/png;base64,AAA" })),
      Object.freeze(node(1, null, { label: "", importance: "low" })),
      Object.freeze(node(2, 1, { label: "同名" })),
      Object.freeze(node(4, null, { label: " \n\t " })),
    ]);
    const before = nodes.map((current) => ({ ...current }));

    const result = buildOutlineRows(nodes);

    expect(result.rows).toEqual([
      { nodeId: 1, depth: 1 },
      { nodeId: 3, depth: 2 },
      { nodeId: 2, depth: 2 },
      { nodeId: 4, depth: 1 },
    ]);
    expect(result.invalidStructure).toBe(false);
    expect(result.duplicateIds).toBe(false);
    expect(result.allNodeIds).toEqual(new Set([3, 1, 2, 4]));
    for (const current of nodes) expect(result.nodesById.get(current.id)).toBe(current);
    expect(nodes).toEqual(before);
  });

  it("空の入力から空の一覧と索引を返す", () => {
    expect(buildOutlineRows([])).toEqual({
      rows: [], nodesById: new Map(), allNodeIds: new Set(), invalidStructure: false, duplicateIds: false,
    });
  });

  it("handlesTenThousandRootsAndDeepChain", () => {
    const roots = Array.from({ length: 10_000 }, (_, index) => node(index + 1, null));
    const chain = Array.from({ length: 10_000 }, (_, index) => node(10_000 - index, index === 9_999 ? null : 9_999 - index));

    const wide = buildOutlineRows(roots);
    const deep = buildOutlineRows(chain);

    expect(wide.rows).toHaveLength(10_000);
    expect(deep.rows).toHaveLength(10_000);
    expect(wide.rows[0]).toEqual({ nodeId: 1, depth: 1 });
    expect(wide.rows[9_999]).toEqual({ nodeId: 10_000, depth: 1 });
    expect(deep.rows[0]).toEqual({ nodeId: 1, depth: 1 });
    expect(deep.rows[9_999]).toEqual({ nodeId: 10_000, depth: 10_000 });
    expect(new Set(wide.rows.map((row) => row.nodeId)).size).toBe(10_000);
    expect(new Set(deep.rows.map((row) => row.nodeId)).size).toBe(10_000);
    expect(wide.rows.every((row) => row.depth === 1)).toBe(true);
    expect(wide.invalidStructure).toBe(false);
    expect(deep.invalidStructure).toBe(false);
    expect(wide.duplicateIds).toBe(false);
    expect(deep.duplicateIds).toBe(false);
  });

  it.each([
    ["親不在", [node(3, 2), node(2, 99)], [3, 2]],
    ["循環", [node(3, 2), node(2, 3)], [3, 2]],
    ["自己参照", [node(2, 2)], [2]],
  ])("reportsOrphanCycleAndDuplicateWithoutMutation: %s", (_, unreachable, fallbackIds) => {
    const nodes = Object.freeze([
      ...unreachable.map((current) => Object.freeze(current)),
      Object.freeze(node(1, null)),
      Object.freeze(node(4, 1)),
    ]);
    const before = nodes.map((current) => ({ ...current }));

    const result = buildOutlineRows(nodes);

    expect(result.rows).toEqual([
      { nodeId: 1, depth: 1 }, { nodeId: 4, depth: 2 },
      ...fallbackIds.map((nodeId) => ({ nodeId, depth: 1 })),
    ]);
    expect(result.invalidStructure).toBe(true);
    expect(result.duplicateIds).toBe(false);
    expect(result.allNodeIds).toEqual(new Set(nodes.map((current) => current.id)));
    expect(nodes).toEqual(before);
  });

  it("重複IDは先頭のノードと親を保持し、行を一度だけ表示する", () => {
    const nodes = Object.freeze([
      Object.freeze(node(2, 1, { label: "最初", illustration: "image", importance: "low" })),
      Object.freeze(node(1, null)),
      Object.freeze(node(2, null, { label: "重複", x: 91, width: 191 })),
      Object.freeze(node(3, 2)),
      Object.freeze(node(1, 3, { label: "循環を作る重複" })),
    ]);
    const before = nodes.map((current) => ({ ...current }));

    const result = buildOutlineRows(nodes);

    expect(result.rows).toEqual([
      { nodeId: 1, depth: 1 }, { nodeId: 2, depth: 2 }, { nodeId: 3, depth: 3 },
    ]);
    expect(result.nodesById.get(2)).toBe(nodes[0]);
    expect(result.nodesById.get(1)).toBe(nodes[1]);
    expect(result.allNodeIds).toEqual(new Set([2, 1, 3]));
    expect(result.invalidStructure).toBe(true);
    expect(result.duplicateIds).toBe(true);
    expect(nodes).toEqual(before);
  });
});
