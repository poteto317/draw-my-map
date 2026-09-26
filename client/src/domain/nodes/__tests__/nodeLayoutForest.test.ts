import { indexNodeForest } from "@/domain/nodes/nodeLayoutForest";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";

function node(id: number, parentId: number | null): Node {
  return createTestNode({ id, parentId, x: id * 10, y: id * 20, label: String(id) });
}

describe("indexNodeForest", () => {
  it("逆順2,000ノードを線形範囲の入力読み取りで索引化し正しい深さを返す", () => {
    const count = 2_000;
    const input = Array.from({ length: count }, (_, index) => {
      const id = count - index;
      return node(id, id === 1 ? null : id - 1);
    });
    let reads = 0;
    const observed = new Proxy(input, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) reads += 1;
        return Reflect.get(target, property, receiver);
      },
    });

    const indexed = indexNodeForest(observed);

    expect(reads).toBeLessThanOrEqual(count * 3);
    expect(indexed?.depthById.size).toBe(count);
    expect(indexed?.depthById.get(1)).toBe(0);
    expect(indexed?.depthById.get(1_000)).toBe(999);
    expect(indexed?.depthById.get(2_000)).toBe(1_999);
  });

  it("親子関係と走査結果を合成して返す", () => {
    const indexed = indexNodeForest([
      node(4, 2), node(2, 1), node(3, 1), node(1, null), node(9, null),
    ]);

    expect(indexed?.roots.map(({ id }) => id)).toEqual([1, 9]);
    expect(indexed?.childrenByParent.get(1)?.map(({ id }) => id)).toEqual([2, 3]);
    expect(indexed?.depthById.get(4)).toBe(2);
    expect(indexed?.nodesByDepth.map((level) => level.map(({ id }) => id)))
      .toEqual([[1, 9], [2, 3], [4]]);
    expect(indexed?.postOrder.map(({ id }) => id).indexOf(4))
      .toBeLessThan(indexed!.postOrder.map(({ id }) => id).indexOf(2));
  });

  it.each([
    ["親子関係を構築できない入力", [node(1, 99)]],
    ["走査できない循環入力", [node(1, 2), node(2, 1)]],
  ])("%sを伝播する", (_name, nodes) => {
    expect(indexNodeForest(nodes)).toBeNull();
  });
});
