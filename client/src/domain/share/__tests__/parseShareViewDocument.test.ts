import {
  asShareViewDocument,
  parseShareViewDocumentJson,
} from "@/domain/share/parseShareViewDocument";
import { SHARE_MESSAGES } from "@/domain/share/shareMessages";
import { createMapDocument, serializeMapDocument } from "@/domain/persistence/mapDocumentCodec";
import { createTestNode } from "@/testing/createTestNode";

describe("parseShareViewDocumentJson", () => {
  it("有効な JSON を MapDocument にする", () => {
    const doc = createMapDocument(
      [createTestNode({ id: 1, parentId: null, label: "根" })],
      "manual",
    );
    const result = parseShareViewDocumentJson(serializeMapDocument(doc));
    expect(result).toEqual({ ok: true, document: doc });
  });

  it("壊れた JSON は viewLoadFailed", () => {
    expect(parseShareViewDocumentJson("{")).toEqual({
      ok: false,
      error: SHARE_MESSAGES.viewLoadFailed,
    });
  });
});

describe("asShareViewDocument", () => {
  it("version 3 + nodes を受け入れる", () => {
    const doc = createMapDocument([], "manual");
    expect(asShareViewDocument(doc)).toEqual({ ok: true, document: doc });
  });

  it("不正オブジェクトは loadError 相当（loading に倒さない）", () => {
    expect(asShareViewDocument({ version: 1, nodes: [] })).toEqual({
      ok: false,
      error: SHARE_MESSAGES.viewLoadFailed,
    });
    expect(asShareViewDocument("x")).toEqual({
      ok: false,
      error: SHARE_MESSAGES.viewLoadFailed,
    });
  });
});
