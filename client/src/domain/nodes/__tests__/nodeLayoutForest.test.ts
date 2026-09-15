import { indexNodeForest } from "@/domain/nodes/nodeLayoutForest";
import type { Node } from "@/types/node";

function node(id: number, parentId: number | null): Node {
  return { id, parentId, x: id * 10, y: id * 20, width: 100, height: 60, label: String(id) };
}

describe("indexNodeForest", () => {
  it("入力順のルート・子と、子が親より前でも有効な深さ・post-orderを返す", () => {
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
    ["ID重複", [node(1, null), node(1, null)]],
    ["親欠損", [node(1, 99)]],
    ["自己参照", [node(1, 1)]],
    ["循環", [node(1, 2), node(2, 1)]],
    ["非有限ID", [{ ...node(1, null), id: Number.NaN }]],
    ["非有限座標", [{ ...node(1, null), x: Number.POSITIVE_INFINITY }]],
    ["非有限サイズ", [{ ...node(1, null), height: Number.NaN }]],
    ["幅0", [{ ...node(1, null), width: 0 }]],
    ["高さ負数", [{ ...node(1, null), height: -1 }]],
  ])("%sを拒否する", (_name, nodes) => {
    expect(indexNodeForest(nodes)).toBeNull();
  });

  it("逆順の深いツリーを線形範囲の入力読み取りで索引化する", () => {
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

    expect(indexNodeForest(observed)?.depthById.get(count)).toBe(count - 1);
    expect(reads).toBeLessThanOrEqual(count * 3);
  });
});
