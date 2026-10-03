import { parseMapDocumentJson, parseMapDocumentJsonWithVersion } from "@/domain/persistence/mapDocumentDecoder";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";
import { createJpegDataUrl } from "@/testing/jpegFixture";

function node(id: number, parentId: number | null, label = `node-${id}`): Node {
  return createTestNode({
    id,
    parentId,
    x: id * 10,
    y: -id * 5,
    width: 160,
    height: 64,
    label,
  });
}

describe("MapDocument Decoder", () => {
  it("V1ノードへmediumを補完してV2として返す", () => {
    const legacy = JSON.stringify({
      version: 1,
      layoutMode: "manual",
      nodes: [{
        id: 1,
        parentId: null,
        x: 0,
        y: 0,
        width: 160,
        height: 64,
        label: "旧形式",
      }],
    });

    expect(parseMapDocumentJson(legacy)).toEqual({
      ok: true,
      value: {
        version: 3,
        layoutMode: "manual",
        nodes: [expect.objectContaining({ id: 1, importance: "medium" })],
      },
    });
  });

  it("V1では未知のimportanceフィールドを無視する", () => {
    const legacy = JSON.stringify({
      version: 1,
      layoutMode: "manual",
      nodes: [{ ...node(1, null), importance: "urgent" }],
    });

    expect(parseMapDocumentJson(legacy)).toEqual({
      ok: true,
      value: {
        version: 3,
        layoutMode: "manual",
        nodes: [node(1, null)],
      },
    });
  });

  it.each([undefined, "urgent", 1])(
    "V2の不正重要度%pを拒否する",
    (importance) => {
      const json = JSON.stringify({
        version: 2,
        layoutMode: "manual",
        nodes: [{ ...node(1, null), importance }],
      });

      expect(parseMapDocumentJson(json)).toEqual({
        ok: false,
        error: "node[0].importanceはhigh、medium、lowのいずれかである必要があります。",
      });
    },
  );

  it("JSONとして解析できない文字列を拒否する", () => {
    expect(parseMapDocumentJson("{"))
      .toEqual({ ok: false, error: "JSONを解析できませんでした。" });
  });

  it.each(["null", "[]", '"map"', "42"])(
    "オブジェクトではないルート%sを拒否する",
    (json) => {
      expect(parseMapDocumentJson(json)).toEqual({
        ok: false,
        error: "マップデータの形式が不正です。",
      });
    },
  );

  it.each([
    ['{"version":4,"layoutMode":"manual","nodes":[]}', "未対応のマップ形式です。"],
    ['{"version":1,"layoutMode":"grid","nodes":[]}', "レイアウトモードが不正です。"],
    ['{"version":1,"layoutMode":"manual","nodes":{}}', "ノード一覧が不正です。"],
  ])("ドキュメント形式の不正を拒否する", (json, error) => {
    expect(parseMapDocumentJson(json)).toEqual({ ok: false, error });
  });

  it("不正なノードを位置付きの正規化エラーとして拒否する", () => {
    const json = JSON.stringify({
      version: 1,
      layoutMode: "manual",
      nodes: [node(1, null), { ...node(2, 1), width: 0 }],
    });

    expect(parseMapDocumentJson(json)).toEqual({
      ok: false,
      error: "node[1].widthは0より大きい有限の数値である必要があります。",
    });
  });

  it("不正なグラフをグラフ検証エラーとして拒否する", () => {
    const json = JSON.stringify({
      version: 1,
      layoutMode: "manual",
      nodes: [node(1, 99)],
    });

    expect(parseMapDocumentJson(json)).toEqual({
      ok: false,
      error: "親ノード 99 が存在しません。",
    });
  });

  it("解析元を変更せず既知フィールドだけの新しいノードを返す", () => {
    const source = {
      version: 1,
      layoutMode: "manual",
      nodes: [{ ...node(1, null), ignored: "維持" }],
    };
    const sourceBefore = {
      ...source,
      nodes: source.nodes.map((current) => ({ ...current })),
    };
    const parseSpy = jest.spyOn(JSON, "parse").mockReturnValue(source);

    try {
      const result = parseMapDocumentJson("source");

      expect(result).toEqual({
        ok: true,
        value: {
          version: 3,
          layoutMode: "manual",
          nodes: [node(1, null)],
        },
      });
      if (result.ok) expect(result.value.nodes[0]).not.toBe(source.nodes[0]);
      expect(source).toEqual(sourceBefore);
    } finally {
      parseSpy.mockRestore();
    }
  });
});

const baseNode = { id: 1, parentId: null, x: 0, y: 0, width: 100, height: 116, label: "a", importance: "medium" };
const IMAGE = createJpegDataUrl(128, 128);
const json = (version: number, node: Record<string, unknown>) =>
  JSON.stringify({ version, layoutMode: "manual", nodes: [node] });

describe("version 3 のイラスト", () => {
  it("version 3 の illustration を読み込む", () => {
    const parsed = parseMapDocumentJsonWithVersion(json(3, { ...baseNode, illustration: IMAGE }));
    expect(parsed).toMatchObject({ ok: true, value: { sourceVersion: 3, document: { version: 3 } } });
    expect(parsed.ok && parsed.value.document.nodes[0].illustration).toBe(IMAGE);
  });

  it("イラストがあり高さが不足するノードは、高さを ILLUSTRATED_NODE_HEIGHT に正規化する", () => {
    const parsed = parseMapDocumentJsonWithVersion(json(3, { ...baseNode, height: 60, illustration: IMAGE }));
    expect(parsed.ok && parsed.value.document.nodes[0].height).toBe(116);
  });

  it("イラストがあり高さが十分なノードは、高さを変えない", () => {
    const parsed = parseMapDocumentJsonWithVersion(json(3, { ...baseNode, height: 200, illustration: IMAGE }));
    expect(parsed.ok && parsed.value.document.nodes[0].height).toBe(200);
  });

  it("イラストが無いノードの高さは、変えない", () => {
    const parsed = parseMapDocumentJsonWithVersion(json(3, { ...baseNode, height: 60 }));
    expect(parsed.ok && parsed.value.document.nodes[0].height).toBe(60);
  });

  it("illustration が無いノードは、項目を持たない", () => {
    const parsed = parseMapDocumentJsonWithVersion(json(3, baseNode));
    expect(parsed.ok && "illustration" in parsed.value.document.nodes[0]).toBe(false);
  });

  it.each([1, 2])("version %i の illustration は無視する", (version) => {
    const node = version === 1 ? { ...baseNode, illustration: IMAGE, importance: undefined } : { ...baseNode, illustration: IMAGE };
    const parsed = parseMapDocumentJsonWithVersion(json(version, node));
    expect(parsed.ok && "illustration" in parsed.value.document.nodes[0]).toBe(false);
    expect(parsed.ok && parsed.value.document.version).toBe(3);
  });

  it.each([
    123,
    "https://example.com/a.png",
    "data:image/svg+xml;base64,AAAA",
    "data:image/png;base64,AAAA",
    createJpegDataUrl(20000, 20000),
  ])(
    "version 3 で不正な illustration（%p）は、読み込みを失敗にする",
    (illustration) => {
      expect(parseMapDocumentJsonWithVersion(json(3, { ...baseNode, illustration }))).toEqual({
        ok: false,
        error: "node[0].illustrationは、画像のdata URLである必要があります。",
      });
    },
  );

  it("version 4 は未対応", () => {
    expect(parseMapDocumentJsonWithVersion(json(4, baseNode))).toEqual({ ok: false, error: "未対応のマップ形式です。" });
  });
});
