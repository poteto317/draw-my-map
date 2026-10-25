import { swapSiblingBranchPositions } from "@/domain/nodes/nodeSiblingSwapPlacement";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

function swapOk(nodes: Node[], first: number[], second: number[]): Node[] {
  const result = swapSiblingBranchPositions(nodes, first, second);
  if (!result.ok) throw new Error(`入れ替えに失敗しました: ${result.reason}`);
  return result.nodes;
}

function ys(nodes: readonly Node[]): Record<number, number> {
  return Object.fromEntries(nodes.map((node) => [node.id, node.y]));
}

function expectXUnchanged(before: readonly Node[], after: readonly Node[]) {
  expect(after.map((node) => node.id)).toEqual(before.map((node) => node.id));
  expect(after.map((node) => node.x)).toEqual(before.map((node) => node.x));
}

describe("swapSiblingBranchPositions", () => {
  it("例1: 子を持つ枝を上へ入れ替える", () => {
    const nodes = [
      createTestNode({ id: 1, x: 10, y: 0 }),
      createTestNode({ id: 2, x: 20, y: 100 }),
      createTestNode({ id: 3, parentId: 2, x: 30, y: 80 }),
      createTestNode({ id: 4, parentId: 2, x: 40, y: 140 }),
    ];

    const result = swapOk(nodes, [2], [1]);

    expect(ys(result)).toEqual({ 1: 140, 2: 20, 3: 0, 4: 60 });
    expectXUnchanged(nodes, result);
  });

  it("例2: 隠れた兄弟を飛び越えて上へ入れ替える", () => {
    const nodes = [
      createTestNode({ id: 1, y: 0 }),
      createTestNode({ id: 2, y: 100 }),
      createTestNode({ id: 3, y: 200 }),
    ];

    const result = swapOk(nodes, [3], [1, 2]);

    expect(ys(result)).toEqual({ 1: 100, 2: 200, 3: 0 });
    expectXUnchanged(nodes, result);
  });

  it("例3: 下へ入れ替える", () => {
    const nodes = [
      createTestNode({ id: 1, y: 0 }),
      createTestNode({ id: 2, y: 100 }),
      createTestNode({ id: 3, y: 200 }),
    ];

    const result = swapOk(nodes, [2, 3], [1]);

    expect(ys(result)).toEqual({ 1: 200, 2: 0, 3: 100 });
    expectXUnchanged(nodes, result);
  });

  it("例4: すでに新しい並びと同じなら座標も要素も変わらない", () => {
    const nodes = [
      createTestNode({ id: 1, y: 200 }),
      createTestNode({ id: 2, y: 0 }),
    ];

    const result = swapOk(nodes, [2], [1]);

    expect(ys(result)).toEqual({ 1: 200, 2: 0 });
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(nodes[0]);
    expect(result[1]).toBe(nodes[1]);
  });

  it("例5: 枝が重なっているときは外接範囲で詰め直す", () => {
    const nodes = [
      createTestNode({ id: 1, y: 0 }),
      createTestNode({ id: 2, y: 50 }),
      createTestNode({ id: 3, parentId: 1, y: 40 }),
    ];

    const result = swapOk(nodes, [2], [1]);

    expect(ys(result)).toEqual({ 1: 100, 2: 0, 3: 140 });
    expectXUnchanged(nodes, result);
  });

  it("折りたたみで隠れた子孫も枝に含めて動かす", () => {
    const nodes = [
      createTestNode({ id: 1, y: 0 }),
      createTestNode({ id: 2, y: 100 }),
      createTestNode({ id: 3, parentId: 2, y: 300 }),
    ];

    const result = swapOk(nodes, [2], [1]);

    expect(ys(result)).toEqual({ 1: 300, 2: 0, 3: 200 });
  });

  it("gap0が0のときは0をそのまま使う", () => {
    const nodes = [
      createTestNode({ id: 1, y: 0 }),
      createTestNode({ id: 2, y: 60 }),
    ];

    const result = swapOk(nodes, [2], [1]);

    expect(ys(result)).toEqual({ 1: 60, 2: 0 });
  });

  it("gap0が負のときは兄弟の間隔の定数を使う", () => {
    const nodes = [
      createTestNode({ id: 1, y: 0 }),
      createTestNode({ id: 2, y: 30 }),
    ];

    const result = swapOk(nodes, [2], [1]);

    expect(ys(result)).toEqual({ 1: 100, 2: 0 });
  });

  it("上端が等しいときはfirstを上にする", () => {
    const nodes = [
      createTestNode({ id: 1, y: 0 }),
      createTestNode({ id: 2, y: 0 }),
    ];

    const result = swapOk(nodes, [2], [1]);

    expect(ys(result)).toEqual({ 1: 100, 2: 0 });
  });

  it("対象外のノードは座標もオブジェクトも変えない", () => {
    const nodes = [
      createTestNode({ id: 1, y: 0 }),
      createTestNode({ id: 2, y: 100 }),
      createTestNode({ id: 9, parentId: 7, y: 10 }),
      createTestNode({ id: 7, y: 500 }),
    ];

    const result = swapOk(nodes, [2], [1]);

    expect(result[2]).toBe(nodes[2]);
    expect(result[2]?.y).toBe(10);
    expect(result[3]).toBe(nodes[3]);
  });

  it("枝の集合が重なる不正なデータはoverlapping-branchesにする", () => {
    const nodes = [
      createTestNode({ id: 1, parentId: 2, y: 0 }),
      createTestNode({ id: 2, y: 100 }),
    ];

    expect(swapSiblingBranchPositions(nodes, [2], [1])).toEqual({
      ok: false,
      reason: "overlapping-branches",
    });
  });

  it("桁落ちで座標を正しく表せないときはplacement-failedにする", () => {
    const nodes = [
      createTestNode({ id: 1, y: 0 }),
      createTestNode({ id: 2, y: 4 }),
      createTestNode({ id: 3, parentId: 2, y: 1e17 }),
    ];

    expect(swapSiblingBranchPositions(nodes, [2], [1])).toEqual({
      ok: false,
      reason: "placement-failed",
    });
  });

  it("巨大な座標で下端が計算できないときはplacement-failedにする", () => {
    const nodes = [
      createTestNode({ id: 1, y: 0 }),
      createTestNode({ id: 2, y: 100 }),
      createTestNode({ id: 3, parentId: 2, y: Number.MAX_VALUE }),
    ];

    expect(swapSiblingBranchPositions(nodes, [2], [1])).toEqual({
      ok: false,
      reason: "placement-failed",
    });
  });

  it("firstまたはsecondが空なら前提の違反としてplacement-failedにする", () => {
    const nodes = [
      createTestNode({ id: 1, y: 0 }),
      createTestNode({ id: 2, y: 100 }),
    ];

    expect(swapSiblingBranchPositions(nodes, [], [1])).toEqual({
      ok: false,
      reason: "placement-failed",
    });
    expect(swapSiblingBranchPositions(nodes, [2], [])).toEqual({
      ok: false,
      reason: "placement-failed",
    });
  });

  it("nodesに無い根を指定したらplacement-failedにする", () => {
    const nodes = [
      createTestNode({ id: 1, y: 0 }),
      createTestNode({ id: 2, y: 100 }),
    ];

    expect(swapSiblingBranchPositions(nodes, [99], [1])).toEqual({
      ok: false,
      reason: "placement-failed",
    });
    expect(swapSiblingBranchPositions(nodes, [2], [99])).toEqual({
      ok: false,
      reason: "placement-failed",
    });
  });

  it("入力の配列とノードを変更しない", () => {
    const nodes = [
      createTestNode({ id: 1, y: 0 }),
      createTestNode({ id: 2, y: 100 }),
      createTestNode({ id: 3, parentId: 2, y: 80 }),
    ];
    const snapshot = nodes.map((node) => ({ ...node }));

    const arrayBefore = [...nodes];

    swapOk(nodes, [2], [1]);

    expect(nodes).toEqual(snapshot);
    nodes.forEach((node, index) => expect(node).toBe(arrayBefore[index]));
  });

  it("兄弟10,000件と10,000ノードの鎖でも例外なく入れ替えられる", () => {
    const siblingCount = 10_000;
    const second = Array.from({ length: siblingCount }, (_, i) => i + 1);
    const siblings = second.map((id) =>
      createTestNode({ id, parentId: null, y: id * 100 }),
    );
    const chainRootId = siblingCount + 1;
    const chain = Array.from({ length: 10_000 }, (_, i) =>
      createTestNode({
        id: chainRootId + i,
        parentId: i === 0 ? null : chainRootId + i - 1,
        y: (siblingCount + 1 + i) * 100,
      }),
    );
    const nodes = [...siblings, ...chain];

    const result = swapSiblingBranchPositions(nodes, [chainRootId], second);

    expect(result.ok).toBe(true);
  });
});
