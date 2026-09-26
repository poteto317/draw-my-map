import { validateMapDocumentGraph } from "@/domain/persistence/mapDocumentGraph";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";

function node(id: number, parentId: number | null): Node {
  return createTestNode({
    id,
    parentId,
    x: 0,
    y: 0,
    width: 160,
    height: 64,
    label: `node-${id}`,
  });
}

describe("validateMapDocumentGraph", () => {
  it("親が子より後に現れるツリーと入力順を受理する", () => {
    const child = node(2, 1);
    const root = node(1, null);
    const input = [child, root];
    const inputBefore = input.map((current) => ({ ...current }));
    const result = validateMapDocumentGraph(input);

    expect(result).toEqual({
      ok: true,
      value: [child, root],
    });
    if (result.ok) expect(result.value).not.toBe(input);
    expect(input).toEqual(inputBefore);
  });

  it("ノードIDの重複を拒否する", () => {
    expect(validateMapDocumentGraph([node(1, null), node(1, null)]))
      .toEqual({ ok: false, error: "ノードID 1 が重複しています。" });
  });

  it("存在しない親ノードへの参照を拒否する", () => {
    expect(validateMapDocumentGraph([node(1, 2)]))
      .toEqual({ ok: false, error: "親ノード 2 が存在しません。" });
  });

  it("自分自身への参照を循環として拒否する", () => {
    expect(validateMapDocumentGraph([node(1, 1)]))
      .toEqual({ ok: false, error: "親子関係が循環しています。" });
  });

  it("ルートを持たない循環を拒否する", () => {
    const result = validateMapDocumentGraph([node(1, 2), node(2, 1)]);

    expect(result).toEqual({ ok: false, error: "親子関係が循環しています。" });
  });

  it("10,000ノードのチェーンをスタックオーバーフローせず受理する", () => {
    const nodes = Array.from({ length: 10_000 }, (_, index) => {
      const id = 10_000 - index;
      return node(id, id === 1 ? null : id - 1);
    });
    const nodesBefore = nodes.map((current) => ({ ...current }));
    const result = validateMapDocumentGraph(nodes);

    expect(result).toEqual({ ok: true, value: nodes });
    if (result.ok) expect(result.value).not.toBe(nodes);
    expect(nodes).toEqual(nodesBefore);
  });
});
