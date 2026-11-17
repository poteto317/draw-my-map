import {
  createMapDocument,
  parseMapDocumentJson,
  serializeMapDocument,
} from "@/domain/persistence/mapDocumentCodec";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";

function node(
  id: number,
  parentId: number | null,
  importance: Node["importance"],
): Node {
  return createTestNode({
    id,
    parentId,
    x: id * 10,
    y: -id * 5,
    width: 160,
    height: 64,
    label: `node-${id}`,
    importance,
  });
}

describe("MapDocument Codec", () => {
  it("互換APIを通じてV2ドキュメントの重要度を往復する", () => {
    const document = createMapDocument([
      node(1, null, "high"),
      node(2, 1, "low"),
    ], "manual");

    expect(parseMapDocumentJson(serializeMapDocument(document))).toEqual({
      ok: true,
      value: document,
    });
  });

  it("V3 の詳細メモ（改行・前後の空白・絵文字を含む）を往復し、メモの無いノードは項目を持たない", () => {
    const withNote = createTestNode({ ...node(1, null, "high"), note: "  1行目\n\n2行目 😀\n" });
    const withoutNote = node(2, 1, "low");
    const document = createMapDocument([withNote, withoutNote], "manual");

    const parsed = parseMapDocumentJson(serializeMapDocument(document));

    expect(parsed).toEqual({ ok: true, value: document });
    expect(parsed.ok && parsed.value.nodes[0].note).toBe("  1行目\n\n2行目 😀\n");
    expect(parsed.ok && "note" in parsed.value.nodes[1]).toBe(false);
  });

  it("V3 の URL（日本語のパスはパーセントエンコード済み）を往復し、URL の無いノードは項目を持たない", () => {
    const links = ["https://example.com/", "https://xn--r8jz45g.jp/%E3%83%91%E3%82%B9"];
    const withLinks = createTestNode({ ...node(1, null, "high"), links });
    const withoutLinks = node(2, 1, "low");
    const document = createMapDocument([withLinks, withoutLinks], "manual");

    const parsed = parseMapDocumentJson(serializeMapDocument(document));

    expect(parsed).toEqual({ ok: true, value: document });
    expect(parsed.ok && parsed.value.nodes[0].links).toEqual(links);
    expect(parsed.ok && "links" in parsed.value.nodes[1]).toBe(false);
  });
});
