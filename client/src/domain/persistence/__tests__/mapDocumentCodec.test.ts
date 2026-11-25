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

  it("V3 のタグ（最初の表記・絵文字を含む）を往復し、タグの無いノードは項目を持たない", () => {
    const tags = ["Python", "機械 学習", "👨‍👩‍👧"];
    const withTags = createTestNode({ ...node(1, null, "high"), tags });
    const withoutTags = node(2, 1, "low");
    const document = createMapDocument([withTags, withoutTags], "manual");

    const parsed = parseMapDocumentJson(serializeMapDocument(document));

    expect(parsed).toEqual({ ok: true, value: document });
    expect(parsed.ok && parsed.value.nodes[0].tags).toEqual(tags);
    expect(parsed.ok && "tags" in parsed.value.nodes[1]).toBe(false);
  });

  it("V3 の出典（ページ・URL 付き）を往復し、出典の無いノードは項目を持たない", () => {
    const sources = [
      { title: "設計入門", page: "12", url: "https://example.com/" },
      { title: "別冊" },
    ] as const;
    const withSources = createTestNode({ ...node(1, null, "high"), sources });
    const withoutSources = node(2, 1, "low");
    const document = createMapDocument([withSources, withoutSources], "manual");

    const parsed = parseMapDocumentJson(serializeMapDocument(document));

    expect(parsed).toEqual({ ok: true, value: document });
    expect(parsed.ok && parsed.value.nodes[0].sources).toEqual(sources);
    expect(parsed.ok && "sources" in parsed.value.nodes[1]).toBe(false);
  });

  it("V3 の layoutStyle / branchLayouts / layoutPinned を往復し、既定はキー省略", () => {
    const pinned = createTestNode({ ...node(1, null, "high"), layoutPinned: true });
    const child = node(2, 1, "low");
    const document = createMapDocument([pinned, child], "manual", {
      layoutStyle: "radial",
      branchLayouts: [{ nodeId: 2, direction: "rl" }],
    });

    const parsed = parseMapDocumentJson(serializeMapDocument(document));
    expect(parsed).toEqual({ ok: true, value: document });
    expect(parsed.ok && parsed.value.nodes[0].layoutPinned).toBe(true);
    expect(parsed.ok && "layoutPinned" in parsed.value.nodes[1]).toBe(false);

    const orthogonal = createMapDocument([child], "manual", {
      layoutStyle: "orthogonal",
      branchLayouts: [],
    });
    const orthogonalText = serializeMapDocument(orthogonal);
    expect(orthogonalText).not.toContain("layoutStyle");
    expect(orthogonalText).not.toContain("branchLayouts");
  });

  it("V3 の tour を往復し、steps 0 件は tour キー省略", () => {
    const snapshot = {
      viewport: { offsetX: 0, offsetY: 0, scale: 1 },
      selectedNodeId: 1,
      selectedNodeIds: [1],
      focusRootId: null,
      collapsedNodeIds: [] as number[],
      resolutionMode: "all" as const,
      autoResolutionLevel: "all" as const,
    };
    const withTour = createMapDocument([node(1, null, "high")], "manual", {
      tour: {
        version: 1,
        title: "往復",
        steps: [{ id: "s1", snapshot, caption: "注釈" }],
      },
    });
    expect(parseMapDocumentJson(serializeMapDocument(withTour))).toEqual({
      ok: true,
      value: withTour,
    });

    const emptySteps = createMapDocument([node(1, null, "high")], "manual", {
      tour: { version: 1, title: "下書き", steps: [] },
    });
    const emptyText = serializeMapDocument(emptySteps);
    expect(emptyText).not.toContain("tour");
    expect(parseMapDocumentJson(emptyText)).toEqual({
      ok: true,
      value: { version: 3, layoutMode: "manual", nodes: emptySteps.nodes },
    });
  });
});
