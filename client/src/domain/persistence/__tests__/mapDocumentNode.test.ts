import { normalizeMapDocumentNode } from "@/domain/persistence/mapDocumentNode";

const validNode = {
  id: 10,
  parentId: null,
  x: 12,
  y: -5,
  width: 160,
  height: 64,
  label: "ルート",
};

describe("normalizeMapDocumentNode", () => {
  it("既知フィールドだけを持つ新しいNodeへ正規化する", () => {
    const input = { ...validNode, ignored: "value" };

    expect(normalizeMapDocumentNode(input, 0)).toEqual({
      ok: true,
      value: validNode,
    });
  });

  it.each([
    ["id", 0],
    ["id", 1.5],
    ["id", Number.MAX_SAFE_INTEGER + 1],
    ["parentId", -1],
    ["x", Number.NaN],
    ["y", Number.POSITIVE_INFINITY],
    ["width", 0],
    ["height", -1],
    ["label", 123],
  ])("node[0].%sの不正値を拒否する", (field, value) => {
    expect(normalizeMapDocumentNode({ ...validNode, [field]: value }, 0))
      .toEqual(expect.objectContaining({ ok: false }));
  });
});
