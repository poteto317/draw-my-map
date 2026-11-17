import { normalizeMapDocumentNode } from "@/domain/persistence/mapDocumentNode";

const validNode = {
  id: 10,
  parentId: null,
  x: 12,
  y: -5,
  width: 160,
  height: 64,
  label: "ルート",
  importance: "medium" as const,
};

describe("normalizeMapDocumentNode", () => {
  it("V1ノードへ既定重要度を補完する", () => {
    const v1Node = {
      id: validNode.id,
      parentId: validNode.parentId,
      x: validNode.x,
      y: validNode.y,
      width: validNode.width,
      height: validNode.height,
      label: validNode.label,
    };

    expect(normalizeMapDocumentNode(v1Node, 0, 1)).toEqual({
      ok: true,
      value: validNode,
    });
  });

  it("既知フィールドだけを持つ新しいNodeへ正規化する", () => {
    const input = { ...validNode, ignored: "value" };

    expect(normalizeMapDocumentNode(input, 0, 2)).toEqual({
      ok: true,
      value: validNode,
    });
  });

  it.each([null, [], "node", 10, true])(
    "オブジェクトではない入力 %p を拒否する",
    (value) => {
      expect(normalizeMapDocumentNode(value, 0, 2)).toEqual({
        ok: false,
        error: "node[0]はオブジェクトである必要があります。",
      });
    },
  );

  it.each([
    ["id", 0, "node[0].idは1以上の安全な整数である必要があります。"],
    ["id", 1.5, "node[0].idは1以上の安全な整数である必要があります。"],
    ["id", Number.MAX_SAFE_INTEGER + 1, "node[0].idは1以上の安全な整数である必要があります。"],
    ["parentId", -1, "node[0].parentIdはnullまたは1以上の安全な整数である必要があります。"],
    ["parentId", 1.5, "node[0].parentIdはnullまたは1以上の安全な整数である必要があります。"],
    ["parentId", Number.MAX_SAFE_INTEGER + 1, "node[0].parentIdはnullまたは1以上の安全な整数である必要があります。"],
    ["x", "12", "node[0].xは有限の数値である必要があります。"],
    ["x", Number.NaN, "node[0].xは有限の数値である必要があります。"],
    ["y", null, "node[0].yは有限の数値である必要があります。"],
    ["y", Number.POSITIVE_INFINITY, "node[0].yは有限の数値である必要があります。"],
    ["width", "160", "node[0].widthは0より大きい有限の数値である必要があります。"],
    ["width", Number.POSITIVE_INFINITY, "node[0].widthは0より大きい有限の数値である必要があります。"],
    ["width", 0, "node[0].widthは0より大きい有限の数値である必要があります。"],
    ["height", Number.POSITIVE_INFINITY, "node[0].heightは0より大きい有限の数値である必要があります。"],
    ["height", Number.NEGATIVE_INFINITY, "node[0].heightは0より大きい有限の数値である必要があります。"],
    ["height", -1, "node[0].heightは0より大きい有限の数値である必要があります。"],
    ["label", 123, "node[0].labelは文字列である必要があります。"],
  ])("node[0].%sの不正値を拒否する", (field, value, error) => {
    expect(normalizeMapDocumentNode({ ...validNode, [field]: value }, 0, 2))
      .toEqual({ ok: false, error });
  });

  it("parentIdが0の場合は完全一致するエラーで拒否する", () => {
    expect(normalizeMapDocumentNode({ ...validNode, parentId: 0 }, 0, 2)).toEqual({
      ok: false,
      error: "node[0].parentIdはnullまたは1以上の安全な整数である必要があります。",
    });
  });
});

describe("normalizeMapDocumentNode の note", () => {
  it("V3 の note を読み込む", () => {
    expect(normalizeMapDocumentNode({ ...validNode, note: "詳しい説明" }, 0, 3)).toEqual({
      ok: true,
      value: { ...validNode, note: "詳しい説明" },
    });
  });

  it("V3 の空白だけの note は、項目ごと持たない", () => {
    const result = normalizeMapDocumentNode({ ...validNode, note: "  \n" }, 0, 3);

    expect(result.ok && "note" in result.value).toBe(false);
  });

  it("V2 の note は無視する", () => {
    const result = normalizeMapDocumentNode({ ...validNode, note: "詳しい説明" }, 0, 2);

    expect(result).toEqual({ ok: true, value: validNode });
    expect(result.ok && "note" in result.value).toBe(false);
  });

  it("V3 の上限超過の note は、位置付きのエラーで拒否する", () => {
    expect(normalizeMapDocumentNode({ ...validNode, note: "a".repeat(10001) }, 4, 3)).toEqual({
      ok: false,
      error: "node[4].noteは10000文字以内の文字列である必要があります。",
    });
  });
});
