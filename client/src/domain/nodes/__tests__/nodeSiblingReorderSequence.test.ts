import {
  buildReorderedSiblings,
  findReorderEndpoints,
} from "@/domain/nodes/nodeSiblingReorderSequence";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

const R = 1;

// 親 R の子として A(2)・B(3)・T(4)・C(5) を並べ、B の子 B1(6) を B と T の間に置く
function family(): Node[] {
  return [
    createTestNode({ id: R }),
    createTestNode({ id: 2, parentId: R }),
    createTestNode({ id: 3, parentId: R }),
    createTestNode({ id: 6, parentId: 3 }),
    createTestNode({ id: 4, parentId: R }),
    createTestNode({ id: 5, parentId: R }),
  ];
}

function byId(nodes: readonly Node[], id: number): Node {
  const found = nodes.find((node) => node.id === id);
  if (found === undefined) throw new Error(`ノード ${id} がありません`);
  return found;
}

describe("findReorderEndpoints", () => {
  it("T・anchor・最初のルートと、anchor が T より前にあるかを返す", () => {
    const nodes = family();

    expect(findReorderEndpoints(nodes, 4, 2)).toEqual({
      node: byId(nodes, 4),
      anchor: byId(nodes, 2),
      anchorFirst: true,
      firstRoot: byId(nodes, R),
    });
    expect(findReorderEndpoints(nodes, 2, 4)?.anchorFirst).toBe(false);
  });

  it("T が無ければ null、anchor が無ければ anchor を null で返す", () => {
    const nodes = family();

    expect(findReorderEndpoints(nodes, 99, 2)).toBeNull();
    expect(findReorderEndpoints(nodes, 4, 99)?.anchor).toBeNull();
  });

  it("ルートが無ければ firstRoot は null", () => {
    const nodes = [createTestNode({ id: 2, parentId: 9 }), createTestNode({ id: 3, parentId: 9 })];

    expect(findReorderEndpoints(nodes, 2, 3)?.firstRoot).toBeNull();
  });
});

describe("buildReorderedSiblings", () => {
  it("before は T を anchor の直前へ移し、anchor から T の直前までの兄弟を下の組にする（子孫は組に入れない）", () => {
    const nodes = family();
    const visible = new Set(nodes.map((node) => node.id));

    const result = buildReorderedSiblings(nodes, byId(nodes, 4), byId(nodes, 2), "before", visible);

    expect(result.nodes.map((node) => node.id)).toEqual([R, 4, 2, 3, 6, 5]);
    expect(result.first).toEqual([4]);
    expect(result.second).toEqual([2, 3]);
    expect(result.visibleIndex).toBe(0);
    expect(result.visibleCount).toBe(4);
    expect(result.firstRoot).toBe(byId(nodes, R));
  });

  it("after は T を anchor の直後へ移し、T の直後から anchor までの兄弟を上の組にする", () => {
    const nodes = family();
    const visible = new Set(nodes.map((node) => node.id));

    const result = buildReorderedSiblings(nodes, byId(nodes, 2), byId(nodes, 4), "after", visible);

    expect(result.nodes.map((node) => node.id)).toEqual([R, 3, 6, 4, 2, 5]);
    expect(result.first).toEqual([3, 4]);
    expect(result.second).toEqual([2]);
    expect(result.visibleIndex).toBe(2);
  });

  it("見えない兄弟は visibleIndex・visibleCount に数えないが、組には入れる", () => {
    const nodes = family();
    const visible = new Set([R, 2, 4, 5]);

    const result = buildReorderedSiblings(nodes, byId(nodes, 5), byId(nodes, 4), "before", visible);

    expect(result.nodes.map((node) => node.id)).toEqual([R, 2, 3, 6, 5, 4]);
    expect(result.second).toEqual([4]);
    expect(result.visibleIndex).toBe(1);
    expect(result.visibleCount).toBe(3);
  });

  it("動かしていないノードは同じオブジェクトのまま積み、入力の配列は変えない", () => {
    const nodes = family();
    const snapshot = [...nodes];
    const visible = new Set(nodes.map((node) => node.id));

    const result = buildReorderedSiblings(nodes, byId(nodes, 4), byId(nodes, 3), "before", visible);

    expect(nodes).toEqual(snapshot);
    for (const node of result.nodes) {
      expect(node).toBe(byId(snapshot, node.id));
    }
  });

  it("ルートの並べ替えでは、並べ替えた後の最初のルートを返す", () => {
    const nodes = [createTestNode({ id: 2 }), createTestNode({ id: 3 })];
    const visible = new Set([2, 3]);

    const result = buildReorderedSiblings(nodes, byId(nodes, 3), byId(nodes, 2), "before", visible);

    expect(result.firstRoot).toBe(byId(nodes, 3));
  });
});
