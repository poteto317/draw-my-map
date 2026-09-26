import { parseMapDocumentJson } from "@/domain/persistence/mapDocumentDecoder";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";

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
        version: 2,
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
        version: 2,
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
    ['{"version":3,"layoutMode":"manual","nodes":[]}', "未対応のマップ形式です。"],
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
          version: 2,
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
