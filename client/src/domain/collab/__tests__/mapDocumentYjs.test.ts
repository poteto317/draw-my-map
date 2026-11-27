import * as Y from "yjs";
import { createMapDocument } from "@/domain/persistence/mapDocumentEncoder";
import {
  initialNextId,
  mapDocumentToYDoc,
  yDocToMapDocument,
} from "@/domain/collab/mapDocumentYjs";
import { createTestNode } from "@/testing/createTestNode";
import type { MapDocumentV3 } from "@/types/mapDocument";
import type { Node } from "@/types/node";

function node(
  id: number,
  parentId: number | null,
  overrides: Partial<Node> = {},
): Node {
  return createTestNode({
    id,
    parentId,
    x: id * 10,
    y: -id * 5,
    width: 160,
    height: 64,
    label: `node-${id}`,
    importance: "medium",
    ...overrides,
  });
}

describe("initialNextId", () => {
  it("空ノードは 1", () => {
    expect(initialNextId([])).toBe(1);
  });

  it("最大 ID + 1 を返す", () => {
    expect(initialNextId([node(2, null), node(7, 2), node(3, 2)])).toBe(8);
  });
});

describe("mapDocumentToYDoc / yDocToMapDocument", () => {
  it("基本文書を往復する", () => {
    const document = createMapDocument(
      [node(1, null, { label: "根" }), node(2, 1, { label: "子", importance: "high" })],
      "manual",
    );

    const encoded = mapDocumentToYDoc(document);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;

    const nodesMap = encoded.value.getMap("nodes");
    expect(nodesMap).toBeInstanceOf(Y.Map);
    expect(nodesMap.get("1")).toBeInstanceOf(Y.Map);
    expect(encoded.value.getMap("meta").get("nextId")).toBe(3);

    const decoded = yDocToMapDocument(encoded.value);
    expect(decoded).toEqual({ ok: true, value: document });
  });

  it("空ノード配列を往復し、meta.nextId は 1", () => {
    const document = createMapDocument([], "auto");

    const encoded = mapDocumentToYDoc(document);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    expect(encoded.value.getMap("meta").get("nextId")).toBe(1);
    expect(encoded.value.getMap("nodes").size).toBe(0);

    const decoded = yDocToMapDocument(encoded.value);
    expect(decoded).toEqual({ ok: true, value: document });
  });

  it("任意フィールドの欠落と空を混同しない（ノード・文書）", () => {
    // note あり vs 欠落。branchLayouts 欠落はキーを発明しない。
    // 空の relations は永続化と同じく正規化でキー省略（欠落扱い）。
    const document: MapDocumentV3 = {
      version: 3,
      layoutMode: "manual",
      nodes: [node(1, null, { note: "メモ" }), node(2, 1)],
      relations: [],
    };

    const encoded = mapDocumentToYDoc(document);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;

    const decoded = yDocToMapDocument(encoded.value);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;

    expect(decoded.value.nodes[0].note).toBe("メモ");
    expect("note" in decoded.value.nodes[1]).toBe(false);
    expect("branchLayouts" in decoded.value).toBe(false);
    expect("relations" in decoded.value).toBe(false);
    expect("links" in decoded.value.nodes[0]).toBe(false);
    expect("links" in decoded.value.nodes[1]).toBe(false);
  });

  it("任意属性ありのノードも往復し、無いノードはキーを持たない", () => {
    const rich = node(1, null, {
      note: "メモ",
      links: ["https://example.com/"],
      tags: ["a"],
      locked: true,
      layoutPinned: true,
    });
    const plain = node(2, 1);
    const document = createMapDocument([rich, plain], "manual", {
      treeDirection: "tb",
      layoutStyle: "radial",
      branchLayouts: [{ nodeId: 2, direction: "rl" }],
    });

    const encoded = mapDocumentToYDoc(document);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;

    const decoded = yDocToMapDocument(encoded.value);
    expect(decoded).toEqual({ ok: true, value: document });
    expect(decoded.ok && "note" in decoded.value.nodes[1]).toBe(false);
    expect(decoded.ok && "links" in decoded.value.nodes[1]).toBe(false);
    expect(decoded.ok && "locked" in decoded.value.nodes[1]).toBe(false);
  });

  it("重複ノード ID は id-collision（開始相当の拒否）", () => {
    const document: MapDocumentV3 = {
      version: 3,
      layoutMode: "manual",
      nodes: [node(1, null), node(1, null, { label: "衝突" })],
    };

    expect(mapDocumentToYDoc(document)).toEqual({
      ok: false,
      reason: "id-collision",
    });
  });

  it("version 不正は invalid-document", () => {
    const document = {
      version: 2,
      layoutMode: "manual",
      nodes: [node(1, null)],
    } as unknown as MapDocumentV3;

    expect(mapDocumentToYDoc(document)).toEqual({
      ok: false,
      reason: "invalid-document",
    });
  });

  it("nodes 共有型が欠落した Y.Doc は decode-error（空ノード成功に倒さない）", () => {
    const ydoc = new Y.Doc();
    ydoc.getMap("meta").set("nextId", 1);
    ydoc.getMap("meta").set("version", 3);
    ydoc.getMap("meta").set("layoutMode", "manual");
    // nodes を作らない

    const decoded = yDocToMapDocument(ydoc);
    expect(decoded).toEqual({ ok: false, reason: "decode-error" });
  });

  it("meta 欠落は decode-error（空文書成功に倒さない）", () => {
    const ydoc = new Y.Doc();
    ydoc.getMap("nodes");

    expect(yDocToMapDocument(ydoc)).toEqual({
      ok: false,
      reason: "decode-error",
    });
  });

  it("encode: NaN / id≤0 / width≤0 のノードは invalid-document", () => {
    expect(
      mapDocumentToYDoc({
        version: 3,
        layoutMode: "manual",
        nodes: [node(1, null, { x: Number.NaN })],
      }),
    ).toEqual({ ok: false, reason: "invalid-document" });

    expect(
      mapDocumentToYDoc({
        version: 3,
        layoutMode: "manual",
        nodes: [node(0, null)],
      }),
    ).toEqual({ ok: false, reason: "invalid-document" });

    expect(
      mapDocumentToYDoc({
        version: 3,
        layoutMode: "manual",
        nodes: [node(1, null, { width: 0 })],
      }),
    ).toEqual({ ok: false, reason: "invalid-document" });
  });

  it("encode: 壊れた optional meta は invalid-document", () => {
    expect(
      mapDocumentToYDoc({
        version: 3,
        layoutMode: "manual",
        nodes: [node(1, null)],
        treeDirection: "diagonal" as MapDocumentV3["treeDirection"],
      }),
    ).toEqual({ ok: false, reason: "invalid-document" });

    expect(
      mapDocumentToYDoc({
        version: 3,
        layoutMode: "manual",
        nodes: [node(1, null)],
        layoutSpacing: { childGap: 1, siblingGap: 1 },
      }),
    ).toEqual({ ok: false, reason: "invalid-document" });
  });

  it("decode: NaN / Infinity / id≤0 / width≤0 は ok:true にしない", () => {
    const cases: Array<Record<string, unknown>> = [
      { id: 1, parentId: null, x: Number.NaN, y: 0, width: 160, height: 64, label: "a", importance: "medium" },
      { id: 1, parentId: null, x: 0, y: Number.POSITIVE_INFINITY, width: 160, height: 64, label: "a", importance: "medium" },
      { id: 0, parentId: null, x: 0, y: 0, width: 160, height: 64, label: "a", importance: "medium" },
      { id: 1, parentId: null, x: 0, y: 0, width: 0, height: 64, label: "a", importance: "medium" },
    ];

    for (const raw of cases) {
      const ydoc = new Y.Doc();
      const nodes = ydoc.getMap("nodes");
      const meta = ydoc.getMap("meta");
      const yNode = new Y.Map();
      ydoc.transact(() => {
        for (const [key, value] of Object.entries(raw)) {
          yNode.set(key, value);
        }
        nodes.set(String(raw.id), yNode);
        meta.set("version", 3);
        meta.set("layoutMode", "manual");
        meta.set("nextId", 2);
      });
      expect(yDocToMapDocument(ydoc)).toEqual({
        ok: false,
        reason: "invalid-document",
      });
    }
  });

  it("decode: Y.Map キーと node.id の不一致は decode-error", () => {
    const ydoc = new Y.Doc();
    const nodes = ydoc.getMap("nodes");
    const meta = ydoc.getMap("meta");
    const yNode = new Y.Map();
    ydoc.transact(() => {
      yNode.set("id", 2);
      yNode.set("parentId", null);
      yNode.set("x", 0);
      yNode.set("y", 0);
      yNode.set("width", 160);
      yNode.set("height", 64);
      yNode.set("label", "ずれ");
      yNode.set("importance", "medium");
      nodes.set("1", yNode);
      meta.set("version", 3);
      meta.set("layoutMode", "manual");
      meta.set("nextId", 3);
    });

    expect(yDocToMapDocument(ydoc)).toEqual({
      ok: false,
      reason: "decode-error",
    });
  });

  it("decode: 壊れた optional meta は invalid-document（無検証で載せない）", () => {
    const base = mapDocumentToYDoc(createMapDocument([node(1, null)], "manual"));
    expect(base.ok).toBe(true);
    if (!base.ok) return;

    base.value.getMap("meta").set("treeDirection", "diagonal");
    expect(yDocToMapDocument(base.value)).toEqual({
      ok: false,
      reason: "invalid-document",
    });

    const base2 = mapDocumentToYDoc(createMapDocument([node(1, null)], "manual"));
    expect(base2.ok).toBe(true);
    if (!base2.ok) return;
    base2.value.getMap("meta").set("layoutSpacing", { childGap: -1, siblingGap: 20 });
    expect(yDocToMapDocument(base2.value)).toEqual({
      ok: false,
      reason: "invalid-document",
    });
  });
});
