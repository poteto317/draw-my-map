import { buildNodeForestRelations } from "@/domain/nodes/nodeLayoutForestRelations";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";

function node(id: number, parentId: number | null): Node {
  return createTestNode({ id, parentId, x: id * 10, y: id * 20, label: String(id) });
}

describe("buildNodeForestRelations", () => {
  it("入力順のルートと子を親子関係として返す", () => {
    const relations = buildNodeForestRelations([
      node(2, 1), node(1, null), node(3, 1), node(9, null),
    ]);

    expect(relations?.roots.map(({ id }) => id)).toEqual([1, 9]);
    expect(relations?.childrenByParent.get(1)?.map(({ id }) => id)).toEqual([2, 3]);
  });

  it("逆順2,000ノードの親子関係を線形範囲の入力読み取りで構築する", () => {
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

    const relations = buildNodeForestRelations(observed);

    expect(reads).toBeLessThanOrEqual(count * 3);
    expect(relations?.roots).toEqual([input[count - 1]]);
    expect(relations?.childrenByParent.size).toBe(count - 1);
    for (const child of input.slice(0, -1)) {
      expect(relations?.childrenByParent.get(child.parentId!)).toEqual([child]);
    }
  });

  it.each([
    ["ID重複", [node(1, null), node(1, null)]],
    ["親欠損", [node(1, 99)]],
    ["非有限ID", [{ ...node(1, null), id: Number.NaN }]],
    ["非有限座標", [{ ...node(1, null), x: Number.POSITIVE_INFINITY }]],
    ["NaNのY", [{ ...node(1, null), y: Number.NaN }]],
    ["無限の幅", [{ ...node(1, null), width: Number.POSITIVE_INFINITY }]],
    ["無限の高さ", [{ ...node(1, null), height: Number.POSITIVE_INFINITY }]],
    ["非有限サイズ", [{ ...node(1, null), height: Number.NaN }]],
    ["幅0", [{ ...node(1, null), width: 0 }]],
    ["高さ負数", [{ ...node(1, null), height: -1 }]],
  ])("%sを拒否する", (_name, nodes) => {
    expect(buildNodeForestRelations(nodes)).toBeNull();
  });
});
