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
});
