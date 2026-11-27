import {
  decodeYjsUpdate,
  encodeDocumentJson,
} from "@/server/collab/collabDocumentCodec";
import { serializeMapDocument } from "@/domain/persistence/mapDocumentCodec";
import type { MapDocumentV3 } from "@/types/mapDocument";

const sampleDoc: MapDocumentV3 = {
  version: 3,
  layoutMode: "manual",
  nodes: [
    {
      id: 1,
      label: "根",
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      parentId: null,
      importance: "medium",
    },
  ],
};

describe("collabDocumentCodec", () => {
  it("encodeDocumentJson: 妥当な JSON を Yjs update へ", () => {
    const encoded = encodeDocumentJson(serializeMapDocument(sampleDoc));
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    expect(encoded.value.byteLength).toBeGreaterThan(0);
  });

  it("encodeDocumentJson: 不正 JSON は invalid-document", () => {
    expect(encodeDocumentJson("{")).toEqual({ ok: false, reason: "invalid-document" });
  });

  it("decodeYjsUpdate: 空 update は export-empty。壊れた update は失敗", () => {
    expect(decodeYjsUpdate(new Uint8Array())).toEqual({ ok: false, reason: "export-empty" });
    expect(decodeYjsUpdate(Uint8Array.from([1, 2, 3])).ok).toBe(false);
  });

  it("decodeYjsUpdate: 往復で文書 JSON を復元", () => {
    const encoded = encodeDocumentJson(serializeMapDocument(sampleDoc));
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const decoded = decodeYjsUpdate(encoded.value);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(JSON.parse(decoded.value)).toMatchObject({
      version: 3,
      nodes: [{ id: 1, label: "根" }],
    });
  });
});
