import { createNodeIdAllocator } from "@/domain/nodes/nodeIdAllocator";
import { duplicateNodeSubtree } from "@/domain/nodes/nodeSubtreeDuplication";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

function deepFreeze(nodes: Node[]): readonly Node[] {
  nodes.forEach((node) => Object.freeze(node));
  return Object.freeze(nodes);
}

function idsFrom(ids: number[]) {
  return jest.fn((_occupied: readonly Node[], count: number) => {
    if (count > ids.length) throw new Error("テスト用IDが不足しています。");
    return ids.slice(0, count);
  });
}

function findNode(nodes: readonly Node[], id: number): Node | undefined {
  return nodes.find((node) => node.id === id);
}

describe("duplicateNodeSubtree", () => {
  it("手動配置では全体の下端から40空けた位置へ枝を複製し元配列を変更しない", () => {
    const originalNodes = deepFreeze([
      createTestNode({ id: 1, y: 0, height: 60 }),
      createTestNode({ id: 2, parentId: 1, x: 200, y: 100, height: 64 }),
      createTestNode({ id: 3, parentId: 2, x: 400, y: 200, height: 100 }),
    ]);
    const before = originalNodes.map((node) => ({ ...node }));
    const allocateIds = idsFrom([200, 201]);

    const result = duplicateNodeSubtree(originalNodes, 2, "manual", allocateIds);

    // source: id=2, parentId=1, y=100。子id=3の下端を含む全体bottom=300。
    // 部分木のminY=100なのでdy=240。採番は200, 201。
    expect(result!.rootId).toBe(200);
    expect(result!.nodes.find((n) => n.id === 200)).toMatchObject({ parentId: 1, x: 200, y: 340 });
    expect(result!.nodes.find((n) => n.id === 201)).toMatchObject({ parentId: 200, x: 400, y: 440 });
    expect(result!.nodes.slice(0, 3)).toEqual(before);
    result!.nodes.slice(0, 3).forEach((node, index) => {
      expect(node).toBe(originalNodes[index]);
    });
    expect(result!.nodes).toHaveLength(5);
    expect(originalNodes).toEqual(before);
    expect(allocateIds).toHaveBeenCalledTimes(1);
    expect(allocateIds).toHaveBeenCalledWith(originalNodes, 2);
  });

  it("子が親より前にある配列でも親子関係を欠落させず全項目を引き継ぐ", () => {
    const originalNodes = deepFreeze([
      createTestNode({
        id: 4, parentId: 3, x: 500, y: 150, width: 90, height: 50,
        label: "孫", importance: "low",
      }),
      createTestNode({
        id: 3, parentId: 2, x: 300, y: 200, width: 120, height: 100,
        label: "子", importance: "high", illustration: "data:image/png;base64,child",
      }),
      createTestNode({ id: 1, x: -100, y: 100, label: "親" }),
      createTestNode({
        id: 2, parentId: 1, x: 100, y: 100, width: 160, height: 64,
        label: "根", importance: "medium", illustration: "data:image/png;base64,root",
      }),
      createTestNode({ id: 5, parentId: 1, x: 100, y: 0, height: 50, label: "別の枝" }),
    ]);
    const before = originalNodes.map((node) => ({ ...node }));

    const result = duplicateNodeSubtree(originalNodes, 2, "manual", idsFrom([300, 301, 302]));

    // 元配列の順序（4, 3, 2）で採番する。全体bottom=300、部分木minY=100でdy=240。
    expect(result).not.toBeNull();
    expect(result!.rootId).toBe(302);
    expect(result!.nodes.slice(5)).toEqual([
      {
        id: 300, parentId: 301, x: 500, y: 390, width: 90, height: 50,
        label: "孫", importance: "low",
      },
      {
        id: 301, parentId: 302, x: 300, y: 440, width: 120, height: 100,
        label: "子", importance: "high", illustration: "data:image/png;base64,child",
      },
      {
        id: 302, parentId: 1, x: 100, y: 340, width: 160, height: 64,
        label: "根", importance: "medium", illustration: "data:image/png;base64,root",
      },
    ]);
    expect(result!.nodes.slice(0, 5)).toEqual(before);
    expect(findNode(result!.nodes, 5)).toBe(originalNodes[4]);
    expect(originalNodes).toEqual(before);
  });

  it("ルートを複製すると複製もルートになり画像なしではillustration項目を追加しない", () => {
    const originalNodes = deepFreeze([
      createTestNode({ id: 1, y: 0, height: 60 }),
      createTestNode({ id: 2, parentId: 1, x: 200, y: 0, height: 60 }),
    ]);

    const result = duplicateNodeSubtree(originalNodes, 1, "manual", idsFrom([10, 11]));

    expect(result!.rootId).toBe(10);
    expect(findNode(result!.nodes, 10)).toMatchObject({ parentId: null, y: 100 });
    expect(findNode(result!.nodes, 11)).toMatchObject({ parentId: 10, y: 100 });
    expect(result!.nodes.slice(2).some((node) => "illustration" in node)).toBe(false);
  });

  it("対象が存在しなければ採番せずnullを返す", () => {
    const allocateIds = idsFrom([10]);

    const result = duplicateNodeSubtree(
      deepFreeze([createTestNode({ id: 1 })]),
      99,
      "manual",
      allocateIds,
    );

    expect(result).toBeNull();
    expect(allocateIds).not.toHaveBeenCalled();
  });

  it("負座標と根より上にある子を含めて部分木の上端から移動量を求める", () => {
    const originalNodes = deepFreeze([
      createTestNode({ id: 1, y: -500, height: 60 }),
      createTestNode({ id: 2, parentId: 1, x: 200, y: -300, height: 60 }),
      createTestNode({ id: 3, parentId: 2, x: 400, y: -400, height: 40 }),
    ]);

    const result = duplicateNodeSubtree(originalNodes, 2, "manual", idsFrom([10, 11]));

    // 全体bottom=-240、部分木minY=-400なのでdy=200。
    expect(findNode(result!.nodes, 10)).toMatchObject({ y: -100 });
    expect(findNode(result!.nodes, 11)).toMatchObject({ y: -200 });
  });

  it("フィルターで隠れうる別の枝の下端も配置判定に含める", () => {
    const originalNodes = deepFreeze([
      createTestNode({ id: 1, y: 0, height: 60 }),
      createTestNode({ id: 2, parentId: 1, x: 200, y: 0, height: 60 }),
      createTestNode({ id: 3, parentId: 1, x: 200, y: 100, height: 60 }),
      createTestNode({ id: 4, parentId: 3, x: 400, y: 900, height: 100 }),
    ]);

    const result = duplicateNodeSubtree(originalNodes, 2, "manual", idsFrom([10]));

    expect(findNode(result!.nodes, 10)).toMatchObject({ parentId: 1, y: 1_040 });
  });

  it("自動配置では元の座標のまま複製候補を生成する", () => {
    const originalNodes = deepFreeze([
      createTestNode({ id: 1, y: 0, height: 60 }),
      createTestNode({ id: 2, parentId: 1, x: 200, y: 30, height: 60 }),
    ]);

    const result = duplicateNodeSubtree(originalNodes, 2, "auto", idsFrom([10]));

    expect(findNode(result!.nodes, 10)).toMatchObject({ parentId: 1, x: 200, y: 30 });
  });

  it.each([
    ["下端が非有限値になる", [
      createTestNode({ id: 1, y: Number.MAX_VALUE, height: Number.MAX_VALUE }),
      createTestNode({ id: 2, parentId: 1, x: 200, y: 0 }),
    ]],
    ["移動量が非有限値になる", [
      createTestNode({ id: 1, y: Number.MAX_VALUE, height: 0 }),
      createTestNode({ id: 2, parentId: 1, x: 200, y: -Number.MAX_VALUE }),
    ]],
    ["複製後の座標が非有限値になる", [
      createTestNode({ id: 1, y: 0, height: 0 }),
      createTestNode({ id: 2, parentId: 1, x: 200, y: 0, height: 0 }),
      createTestNode({ id: 3, parentId: 2, x: 400, y: Number.MAX_VALUE * 0.6, height: 0 }),
    ]],
    ["複製後の下端が非有限値になる", [
      createTestNode({ id: 1, y: 0, height: 0 }),
      createTestNode({ id: 2, parentId: 1, x: 200, y: 0, height: Number.MAX_VALUE * 0.6 }),
    ]],
    ["丸めで40の間隔を確保できない", [
      createTestNode({ id: 1, y: 2 ** 60, height: 256 }),
      createTestNode({ id: 2, parentId: 1, x: 200, y: 0 }),
    ]],
  ])("手動配置で%sときはnullを返し自動配置では拒否しない", (_name, nodes) => {
    const originalNodes = deepFreeze(nodes);
    const sourceId = 2;

    expect(duplicateNodeSubtree(originalNodes, sourceId, "manual", idsFrom([10, 11])))
      .toBeNull();
    expect(duplicateNodeSubtree(originalNodes, sourceId, "auto", idsFrom([10, 11])))
      .not.toBeNull();
  });

  it("1万段の枝も再帰エラーなしで実物のallocatorを使って複製できる", () => {
    const depth = 10_000;
    const originalNodes = deepFreeze(Array.from({ length: depth }, (_, index) => (
      createTestNode({
        id: index + 1,
        parentId: index === 0 ? null : index,
        x: index * 10,
        y: 0,
        height: 60,
      })
    )));

    const result = duplicateNodeSubtree(
      originalNodes,
      1,
      "manual",
      createNodeIdAllocator().nextAvailableIds,
    );

    expect(result).not.toBeNull();
    const copies = result!.nodes.slice(depth);
    expect(copies).toHaveLength(depth);
    const originalIds = new Set(originalNodes.map((node) => node.id));
    const copyIds = new Set(copies.map((node) => node.id));
    expect(copyIds.size).toBe(depth);
    expect(copies.some((node) => originalIds.has(node.id))).toBe(false);
    expect(copies[0]).toMatchObject({ id: result!.rootId, parentId: null, y: 100 });
    copies.slice(1).forEach((node, index) => {
      expect(node.parentId).toBe(copies[index].id);
    });
  });
});
