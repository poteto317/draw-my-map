import { resolveOutlineParentCandidate } from "@/components/layout/outlineParentCandidate";
import { DEFAULT_NODE_IMPORTANCE } from "@/domain/nodes/nodeImportance";
import type { Node } from "@/types/node";

function node(id: number, label: string): Node {
  return { id, parentId: null, x: 0, y: 0, width: 100, height: 40, label, importance: DEFAULT_NODE_IMPORTANCE };
}

describe("resolveOutlineParentCandidate", () => {
  it("控えた ID が無ければ none", () => {
    expect(resolveOutlineParentCandidate([node(1, "a")], null, false)).toEqual({ kind: "none" });
  });

  it("古くなっていれば、同じ ID のノードがあっても missing", () => {
    expect(resolveOutlineParentCandidate([node(1, "a")], 1, false)).toEqual({ kind: "found", label: "a" });
    expect(resolveOutlineParentCandidate([node(1, "a")], 1, true)).toEqual({ kind: "missing" });
  });

  it("今のマップに無ければ missing", () => {
    expect(resolveOutlineParentCandidate([node(1, "a")], 2, false)).toEqual({ kind: "missing" });
  });

  it("表示名の先頭40コードポイントをラベルにする", () => {
    const label = "\u{1F600}".repeat(41);
    expect(resolveOutlineParentCandidate([node(1, label)], 1, false)).toEqual({
      kind: "found",
      label: "\u{1F600}".repeat(40),
    });
  });

  it("空のラベルは表示名（新しいノード）にする", () => {
    expect(resolveOutlineParentCandidate([node(1, "")], 1, false)).toEqual({
      kind: "found",
      label: "新しいノード",
    });
  });
});
