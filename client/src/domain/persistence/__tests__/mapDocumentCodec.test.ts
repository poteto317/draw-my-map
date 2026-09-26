import {
  createMapDocument,
  parseMapDocumentJson,
  serializeMapDocument,
} from "@/domain/persistence/mapDocumentCodec";
import type { MapDocumentV1 } from "@/types/mapDocument";
import type { Node } from "@/types/node";

function node(id: number, parentId: number | null, label = `node-${id}`): Node {
  return {
    id,
    parentId,
    x: id * 10,
    y: -id * 5,
    width: 160,
    height: 64,
    label,
    importance: "medium",
  };
}

describe("MapDocument Codec", () => {
  it("空のマップをJSONへ変換して往復する", () => {
    const document = createMapDocument([], "manual");

    expect(parseMapDocumentJson(serializeMapDocument(document))).toEqual({
      ok: true,
      value: document,
    });
  });

  it("入れ子のマップをインデント付きJSONへ変換して往復する", () => {
    const document = createMapDocument(
      [node(1, null, "親"), node(2, 1, "子"), node(3, 2, "孫")],
      "auto",
    );
    const json = serializeMapDocument(document);

    expect(json.endsWith("\n")).toBe(true);
    expect(json).toContain('\n  "version": 1');
    expect(parseMapDocumentJson(json)).toEqual({ ok: true, value: document });
  });

  it("作成後の状態変更から独立したノード配列とノードを保持する", () => {
    const originalNode = node(1, null, "作成時");
    const nodes = [originalNode];
    const document = createMapDocument(nodes, "manual");

    originalNode.label = "変更後";
    nodes.push(node(2, 1));

    expect(document.nodes).toEqual([node(1, null, "作成時")]);
    expect(document.nodes).not.toBe(nodes);
    expect(document.nodes[0]).not.toBe(originalNode);
  });

  it("作成時にノードの未知フィールドを除去する", () => {
    const input = { ...node(1, null), selected: true };

    expect(createMapDocument([input], "manual")).toEqual({
      version: 1,
      layoutMode: "manual",
      nodes: [node(1, null)],
    });
  });

  it("直列化時にトップレベルとノードの未知フィールドを除去する", () => {
    const inputNode = { ...node(1, null), editing: true };
    const document: MapDocumentV1 & { viewport: { x: number; y: number } } = {
      version: 1,
      layoutMode: "manual",
      nodes: [inputNode],
      viewport: { x: 100, y: 200 },
    };

    expect(JSON.parse(serializeMapDocument(document))).toEqual({
      version: 1,
      layoutMode: "manual",
      nodes: [node(1, null)],
    });
  });

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

  it("未対応versionを拒否する", () => {
    expect(parseMapDocumentJson('{"version":2,"layoutMode":"manual","nodes":[]}'))
      .toEqual({ ok: false, error: "未対応のマップ形式です。" });
  });

  it("不正なレイアウトモードを拒否する", () => {
    expect(parseMapDocumentJson('{"version":1,"layoutMode":"grid","nodes":[]}'))
      .toEqual({ ok: false, error: "レイアウトモードが不正です。" });
  });

  it("配列ではないノード一覧を拒否する", () => {
    expect(parseMapDocumentJson('{"version":1,"layoutMode":"manual","nodes":{}}'))
      .toEqual({ ok: false, error: "ノード一覧が不正です。" });
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
          version: 1,
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
