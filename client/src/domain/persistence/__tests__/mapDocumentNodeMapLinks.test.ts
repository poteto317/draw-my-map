import { NODE_MAP_LINKS_MAX_COUNT } from "@/domain/nodes/nodeMapLink";
import { parseMapDocumentJson } from "@/domain/persistence/mapDocumentDecoder";
import { createMapDocument, serializeMapDocument } from "@/domain/persistence/mapDocumentEncoder";
import { normalizeMapDocumentNodeMapLinks } from "@/domain/persistence/mapDocumentNodeMapLinks";
import { createTestNode } from "@/testing/createTestNode";

const ERROR =
  "node[2].mapLinksは、有効なマップ ID と任意のノード ID（1以上の安全な整数）からなるマップ間リンクの配列（最大10件）である必要があります。";

function linksOf(count: number) {
  return Array.from({ length: count }, (_, index) => ({ targetMapId: `map-${index}` }));
}

describe("normalizeMapDocumentNodeMapLinks", () => {
  it.each([1, 2] as const)("V%d では mapLinks を無視して undefined を返す（不正な値でも失敗にしない）", (version) => {
    expect(normalizeMapDocumentNodeMapLinks([{ targetMapId: "map-1" }], 0, version)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(normalizeMapDocumentNodeMapLinks("broken", 0, version)).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("V3 で undefined なら undefined", () => {
    expect(normalizeMapDocumentNodeMapLinks(undefined, 0, 3)).toEqual({ ok: true, value: undefined });
  });

  it("V3 で有効なマップ全体・ノード指定リンクを順を保って返す", () => {
    expect(
      normalizeMapDocumentNodeMapLinks(
        [{ targetMapId: "map-1" }, { targetMapId: "map_2", targetNodeId: 5 }],
        0,
        3,
      ),
    ).toEqual({
      ok: true,
      value: [{ targetMapId: "map-1" }, { targetMapId: "map_2", targetNodeId: 5 }],
    });
  });

  it("同じリンクは先勝ちで重複除去する", () => {
    expect(
      normalizeMapDocumentNodeMapLinks(
        [
          { targetMapId: "map-1" },
          { targetMapId: "map-1", targetNodeId: 2 },
          { targetMapId: "map-1" },
          { targetMapId: "map-1", targetNodeId: 2 },
        ],
        0,
        3,
      ),
    ).toEqual({
      ok: true,
      value: [{ targetMapId: "map-1" }, { targetMapId: "map-1", targetNodeId: 2 }],
    });
  });

  it("空配列は undefined（キーごと持たない）", () => {
    expect(normalizeMapDocumentNodeMapLinks([], 0, 3)).toEqual({ ok: true, value: undefined });
  });

  it("ちょうど 10 件は受け付ける", () => {
    expect(normalizeMapDocumentNodeMapLinks(linksOf(NODE_MAP_LINKS_MAX_COUNT), 0, 3)).toEqual({
      ok: true,
      value: linksOf(NODE_MAP_LINKS_MAX_COUNT),
    });
  });

  it.each<[string, unknown]>([
    ["null", null],
    ["文字列", "map-1"],
    ["オブジェクト", { targetMapId: "map-1" }],
    ["数値の要素", [1]],
    ["null の要素", [null]],
    ["配列の要素", [[{ targetMapId: "map-1" }]]],
    ["非プレーンオブジェクト", [Object.assign(new Date(), { targetMapId: "map-1" })]],
    ["targetMapId 欠落", [{ targetNodeId: 1 }]],
    ["未知キーあり", [{ targetMapId: "map-1", extra: true }]],
    ["targetMapId が数値", [{ targetMapId: 1 }]],
    ["targetMapId が空文字", [{ targetMapId: "" }]],
    ["targetMapId にコロン", [{ targetMapId: "map:1" }]],
    ["targetMapId が 65 文字", [{ targetMapId: "a".repeat(65) }]],
    ["targetNodeId が null", [{ targetMapId: "map-1", targetNodeId: null }]],
    ["targetNodeId が undefined 明示キー", [{ targetMapId: "map-1", targetNodeId: undefined }]],
    ["targetNodeId が文字列", [{ targetMapId: "map-1", targetNodeId: "1" }]],
    ["targetNodeId が 0", [{ targetMapId: "map-1", targetNodeId: 0 }]],
    ["targetNodeId が負数", [{ targetMapId: "map-1", targetNodeId: -1 }]],
    ["targetNodeId が小数", [{ targetMapId: "map-1", targetNodeId: 1.5 }]],
    ["targetNodeId が安全整数上限超え", [{ targetMapId: "map-1", targetNodeId: 9007199254740992 }]],
    ["11 件", linksOf(NODE_MAP_LINKS_MAX_COUNT + 1)],
    ["正しい要素の後ろに不正な要素", [{ targetMapId: "map-1" }, { targetMapId: "" }]],
  ])("V3 で不正な mapLinks（%s）は失敗", (_name, value) => {
    expect(normalizeMapDocumentNodeMapLinks(value, 2, 3)).toEqual({ ok: false, error: ERROR });
  });

  it("11 件は重複を除けば 10 件以下でも失敗（件数は正規化より先に判定する。L-443）", () => {
    expect(
      normalizeMapDocumentNodeMapLinks([...linksOf(NODE_MAP_LINKS_MAX_COUNT), { targetMapId: "map-0" }], 2, 3),
    ).toEqual({ ok: false, error: ERROR });
  });

  it("V3 文書の書き出しと読み込みで mapLinks が往復する", () => {
    const nodes = [
      createTestNode({
        id: 1,
        label: "リンクあり",
        mapLinks: [{ targetMapId: "map-a" }, { targetMapId: "map-b", targetNodeId: 3 }],
      }),
      createTestNode({ id: 2, label: "リンクなし", x: 200 }),
    ];

    const parsed = parseMapDocumentJson(serializeMapDocument(createMapDocument(nodes, "manual")));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.nodes[0].mapLinks).toEqual([
      { targetMapId: "map-a" },
      { targetMapId: "map-b", targetNodeId: 3 },
    ]);
    expect("mapLinks" in parsed.value.nodes[1]).toBe(false);
  });
});
