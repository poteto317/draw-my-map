import { resolveExchangeExportNodes } from "@/domain/exportScope/resolveExchangeExportNodes";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

function node(id: number, parentId: number | null, label?: string): Node {
  return createTestNode({ id, parentId, label: label ?? `n${id}` });
}

describe("resolveExchangeExportNodes", () => {
  const tree = [
    node(1, null, "root"),
    node(2, 1, "mid"),
    node(3, 2, "leaf"),
    node(4, null, "other"),
  ];

  it("all スコープは全ノードをそのまま返す", () => {
    expect(resolveExchangeExportNodes("all", tree, new Set(tree.map((n) => n.id)), [1])).toEqual(tree);
  });

  it("表示中スコープは可視ノードと祖先を閉包する", () => {
    const closed = resolveExchangeExportNodes("visible", tree, new Set([3]), [3]);
    expect(closed.map((n) => n.id).sort()).toEqual([1, 2, 3]);
    expect(closed.find((n) => n.id === 3)?.parentId).toBe(2);
  });

  it("選択スコープは部分木のあと祖先を閉包し子孫は欠けない", () => {
    const closed = resolveExchangeExportNodes("selection", tree, new Set(tree.map((n) => n.id)), [2]);
    expect(closed.map((n) => n.label).sort()).toEqual(["leaf", "mid", "root"]);
    expect(closed.find((n) => n.id === 2)?.parentId).toBe(1);
    expect(closed.find((n) => n.id === 3)?.parentId).toBe(2);
  });

  it("選択が無効なときは空配列", () => {
    expect(resolveExchangeExportNodes("selection", tree, new Set(), [])).toEqual([]);
  });
});