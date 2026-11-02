import { canDeleteNodeOnly, deleteNodeOnly } from "@/domain/nodes/nodeOnlyDeletion";
import { createTestNode } from "@/testing/createTestNode";
import { createJpegDataUrl } from "@/testing/jpegFixture";
import type { Node } from "@/types/node";
const node = (id: number, parentId: number | null = null): Node => createTestNode({ id, parentId, label: `ノード${id}`, x: id * 11, y: id * 13 });
const visible = new Set([1, 2, 4, 9]);
function success(nodes: readonly Node[], id: number, mode: "manual" | "auto" = "manual") {
  const result = deleteNodeOnly(nodes, id, new Set(nodes.map(n => n.id)), mode);
  expect(result.ok).toBe(true);
  if (!result.ok)
    throw new Error(result.reason);
  return result.nodes;
}
describe("ノードだけ削除", () => {
  it("非連続の直下の子をTの位置へ移し全属性と孫を保つ", () => {
    const nodes = [node(1), node(6, 4), node(2, 1), node(8, 2), node(4, 1), node(3, 1), node(7, 6), node(5, 4), node(9)];
    nodes[1] = { ...nodes[1], importance: "high", illustration: createJpegDataUrl(100, 100), height: 240 };
    const before = nodes.map(n => ({ ...n }));
    nodes.forEach(Object.freeze);
    Object.freeze(nodes);
    const result = deleteNodeOnly(nodes, 4, visible, "manual");
    expect(result.ok).toBe(true);
    if (!result.ok)
      return;
    expect(result.nodes.map(n => n.id)).toEqual([1, 2, 8, 6, 5, 3, 7, 9]);
    expect(result.nodes.filter(n => n.parentId === 1).map(n => n.id)).toEqual([2, 6, 5, 3]);
    expect(result.nodes).toHaveLength(nodes.length - 1);
    for (const remaining of result.nodes) {
      const original = before.find(n => n.id === remaining.id)!;
      expect(remaining).toEqual({ ...original, parentId: original.parentId === 4 ? 1 : original.parentId });
      expect(Object.prototype.hasOwnProperty.call(remaining, "illustration")).toBe(Object.prototype.hasOwnProperty.call(original, "illustration"));
    }
    expect(nodes).toEqual(before);
  });
  it("葉と唯一の根を削除し、実在と可視性で有効状態を決める", () => {
    const nodes = [node(1), node(2, 1)];
    expect(success(nodes, 2)).toEqual([nodes[0]]);
    expect(success([node(1)], 1)).toEqual([]);
    for (const id of [null, 99])
      expect(canDeleteNodeOnly(nodes, id, visible)).toBe(false);
    expect(canDeleteNodeOnly(nodes, 2, new Set([1]))).toBe(false);
    for (const id of [1, 2])
      expect(canDeleteNodeOnly(nodes, id, visible)).toBe(true);
  });
  it.each(["manual", "auto"] as const)("%sで全ルート位置と0/1/複数の子を扱う", mode => {
    for (const position of [0, 1, 2])
      for (const count of [0, 1, 2]) {
        const roots = [node(1), node(4), node(9)];
        roots[position] = { ...roots[position], x: 30, y: 40 };
        const target = roots[position];
        const children = Array.from({ length: count }, (_, i) => node(20 + i, target.id));
        const nodes = [...children, ...roots, ...(count ? [node(30, 20)] : [])];
        const next = success(nodes, target.id, mode);
        const rootIds = roots.flatMap(n => n.id === target.id ? children.map(c => c.id) : [n.id]);
        expect(next.filter(n => n.parentId === null).map(n => n.id)).toEqual(rootIds);
        for (const remaining of next) {
          const original = nodes.find(n => n.id === remaining.id)!;
          const anchor = mode === "auto" && position === 0 && remaining.id === rootIds[0];
          expect(remaining).toEqual({ ...original, parentId: original.parentId === target.id ? null : original.parentId, ...(anchor ? { x: 30, y: 40 } : {}) });
        }
      }
  });
  const invalid: [
    string,
    Node[],
    "invalid-structure" | "placement-failed"
  ][] = [
    ["ID重複", [node(1), node(1)], "invalid-structure"],
    ["親欠け", [node(1, 9)], "invalid-structure"],
    ["自己参照", [node(1, 1)], "invalid-structure"],
    ["長い循環", [node(1, 3), node(2, 1), node(3, 2)], "invalid-structure"],
    ["非有限ID", [node(1), { ...node(2), id: Infinity }], "invalid-structure"],
    ...(["x", "y", "width", "height"] as const).flatMap(key => [NaN, Infinity].map((value): [
      string,
      Node[],
      "placement-failed"
    ] => [key + value, [{ ...node(1), [key]: value }], "placement-failed"])),
    ...(["width", "height"] as const).flatMap(key => [0, -1].map((value): [
      string,
      Node[],
      "placement-failed"
    ] => [key + value, [{ ...node(1), [key]: value }], "placement-failed"])),
  ];
  it.each(invalid)("%sを削除で隠蔽せず入力を保持", (_, nodes, reason) => {
    const before = nodes.map(n => ({ ...n }));
    expect(deleteNodeOnly(nodes, 99, visible, "manual")).toEqual({ ok: false, reason: "node-missing" });
    expect(deleteNodeOnly(nodes, 1, new Set(), "manual")).toEqual({ ok: false, reason: "node-hidden" });
    expect(deleteNodeOnly(nodes, 1, visible, "manual")).toEqual({ ok: false, reason });
    expect(nodes).toEqual(before);
  });
  it("数千段の枝も中間1個以外を保持", () => {
    const nodes = Array.from({ length: 6000 }, (_, i) => node(i + 1, i === 0 ? null : i));
    const next = success(nodes, 3000);
    expect(next).toHaveLength(5999);
    expect(next).toEqual(nodes.filter(n => n.id !== 3000).map(n => n.id === 3001 ? { ...n, parentId: 2999 } : n));
  });
});
