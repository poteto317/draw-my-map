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

describe("normalizeMapDocumentNode の links", () => {
  it("V3 の links を正規化して読み込む", () => {
    expect(normalizeMapDocumentNode({ ...validNode, links: ["https://Example.com"] }, 0, 3)).toEqual({
      ok: true,
      value: { ...validNode, links: ["https://example.com/"] },
    });
  });

  it("V3 の空の links は、項目ごと持たない", () => {
    const result = normalizeMapDocumentNode({ ...validNode, links: [] }, 0, 3);

    expect(result.ok && "links" in result.value).toBe(false);
  });

  it("V2 の links は無視する", () => {
    const result = normalizeMapDocumentNode({ ...validNode, links: ["https://example.com/"] }, 0, 2);

    expect(result).toEqual({ ok: true, value: validNode });
    expect(result.ok && "links" in result.value).toBe(false);
  });

  it("V3 の不正な links は、位置付きのエラーで拒否する", () => {
    expect(normalizeMapDocumentNode({ ...validNode, links: ["javascript:alert(1)"] }, 4, 3)).toEqual({
      ok: false,
      error: "node[4].linksは、http または https の URL（2048文字以内）の配列（最大10件）である必要があります。",
    });
  });
});

describe("normalizeMapDocumentNode の tags", () => {
  it("V3 の tags を正規化して読み込み、同じタグとみなす要素は後のものを捨てる", () => {
    expect(normalizeMapDocumentNode({ ...validNode, tags: [" Python ", "python", "重要"] }, 0, 3)).toEqual({
      ok: true,
      value: { ...validNode, tags: ["Python", "重要"] },
    });
  });

  it("V3 の空の tags は、項目ごと持たない", () => {
    const result = normalizeMapDocumentNode({ ...validNode, tags: [] }, 0, 3);

    expect(result.ok && "tags" in result.value).toBe(false);
  });

  it("V2 の tags は無視する", () => {
    const result = normalizeMapDocumentNode({ ...validNode, tags: ["重要"] }, 0, 2);

    expect(result).toEqual({ ok: true, value: validNode });
    expect(result.ok && "tags" in result.value).toBe(false);
  });

  it("V3 の不正な tags は、位置付きのエラーで拒否する", () => {
    expect(normalizeMapDocumentNode({ ...validNode, tags: ["a\u0000b"] }, 4, 3)).toEqual({
      ok: false,
      error: "node[4].tagsは、30文字以内のタグ名の配列（最大10件）である必要があります。",
    });
  });
});

describe("normalizeMapDocumentNode の sources", () => {
  it("V3 の sources を正規化して読み込み、同じ出典とみなす要素は後のものを捨てる", () => {
    expect(
      normalizeMapDocumentNode(
        {
          ...validNode,
          sources: [
            { title: " Python ", page: " 1 ", url: "https://Example.com" },
            { title: "python", page: "1", url: "https://example.com/" },
            { title: "設計" },
          ],
        },
        0,
        3,
      ),
    ).toEqual({
      ok: true,
      value: {
        ...validNode,
        sources: [
          { title: "Python", page: "1", url: "https://example.com/" },
          { title: "設計" },
        ],
      },
    });
  });

  it("V3 の空の sources は、項目ごと持たない", () => {
    const result = normalizeMapDocumentNode({ ...validNode, sources: [] }, 0, 3);

    expect(result.ok && "sources" in result.value).toBe(false);
  });

  it("V2 の sources は無視する", () => {
    const result = normalizeMapDocumentNode({ ...validNode, sources: [{ title: "設計" }] }, 0, 2);

    expect(result).toEqual({ ok: true, value: validNode });
    expect(result.ok && "sources" in result.value).toBe(false);
  });

  it("V3 の不正な sources は、位置付きのエラーで拒否する", () => {
    expect(normalizeMapDocumentNode({ ...validNode, sources: [{ title: "設計", author: "x" }] }, 4, 3)).toEqual({
      ok: false,
      error:
        "node[4].sourcesは、タイトル（200文字以内）・ページ（80文字以内）・http/https の URL からなる出典の配列（最大10件）である必要があります。",
    });
  });
});

test("V3では属性を保持し、旧バージョンでは新しいキーを除く", () => {
  const attributes = {
    task: { completed: false, dueDate: "2024-02-29", assignee: "担当者" },
    customAttributes: [{ name: "分類", type: "choice", options: ["B", "A"], value: "A" }],
  } as const;
  expect(normalizeMapDocumentNode({ ...validNode, ...attributes }, 0, 3)).toEqual({
    ok: true, value: { ...validNode, ...attributes },
  });
  for (const version of [1, 2] as const) {
    expect(normalizeMapDocumentNode({ ...validNode, task: null, customAttributes: null }, 0, version)).toEqual({
      ok: true, value: validNode,
    });
    expect(normalizeMapDocumentNode({ ...validNode, ...attributes }, 0, version)).toEqual({
      ok: true, value: validNode,
    });
  }
});

test("V3では task / customAttributes の null を省略と同じ扱いにする", () => {
  expect(normalizeMapDocumentNode({ ...validNode, task: null, customAttributes: null }, 0, 3)).toEqual({
    ok: true, value: validNode,
  });
});

test.each([
  { task: { completed: true, unknown: 1 } },
  { customAttributes: [{ name: "数", type: "number", value: "1" }] },
  { customAttributes: [{ name: "選択", type: "choice", options: ["A"], value: "B" }] },
])("不正なV3属性を拒絶する %j", (attributes) => {
  expect(normalizeMapDocumentNode({ ...validNode, ...attributes }, 2, 3)).toMatchObject({
    ok: false, error: expect.stringContaining("node[2]."),
  });
});
