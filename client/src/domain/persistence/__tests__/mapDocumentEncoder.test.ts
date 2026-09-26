import {
  createMapDocument,
  serializeMapDocument,
} from "@/domain/persistence/mapDocumentEncoder";
import type { MapDocument } from "@/types/mapDocument";
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

describe("MapDocument Encoder", () => {
  it("V2ドキュメントを作成する", () => {
    expect(createMapDocument([node(1, null)], "auto")).toEqual({
      version: 2,
      layoutMode: "auto",
      nodes: [node(1, null)],
    });
  });

  it("インデントと末尾改行を含むJSONへ変換する", () => {
    const json = serializeMapDocument(createMapDocument([node(1, null)], "manual"));

    expect(json.endsWith("\n")).toBe(true);
    expect(json).toContain('\n  "version": 2');
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
      version: 2,
      layoutMode: "manual",
      nodes: [node(1, null)],
    });
  });

  it("直列化時にトップレベルとノードの未知フィールドを除去する", () => {
    const inputNode = { ...node(1, null), editing: true };
    const document: MapDocument & { viewport: { x: number; y: number } } = {
      version: 2,
      layoutMode: "manual",
      nodes: [inputNode],
      viewport: { x: 100, y: 200 },
    };

    expect(JSON.parse(serializeMapDocument(document))).toEqual({
      version: 2,
      layoutMode: "manual",
      nodes: [node(1, null)],
    });
  });
});
