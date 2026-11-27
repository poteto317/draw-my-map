import * as Y from "yjs";
import { mapDocumentToYDoc, yDocToMapDocument } from "@/domain/collab/mapDocumentYjs";
import {
  parseMapDocumentJson,
  serializeMapDocument,
} from "@/domain/persistence/mapDocumentCodec";
import type { ShareResult } from "@/domain/share/shareResult";

/**
 * MapDocument JSON ↔ Yjs update の純変換（collabService の I/O オーケストレーションから分離）。
 */
export function encodeDocumentJson(documentJson: string): ShareResult<Uint8Array> {
  const parsed = parseMapDocumentJson(documentJson);
  if (!parsed.ok) return { ok: false, reason: "invalid-document" };
  const ydocResult = mapDocumentToYDoc(parsed.value);
  if (!ydocResult.ok) return { ok: false, reason: ydocResult.reason };
  try {
    return { ok: true, value: Y.encodeStateAsUpdate(ydocResult.value) };
  } catch {
    return { ok: false, reason: "encode-error" };
  }
}

export function decodeYjsUpdate(update: Uint8Array): ShareResult<string> {
  if (update.byteLength === 0) {
    return { ok: false, reason: "export-empty" };
  }
  try {
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, update);
    const docResult = yDocToMapDocument(ydoc);
    if (!docResult.ok) {
      // invalid-document / decode-error / id-collision を export-empty に潰さない
      return { ok: false, reason: docResult.reason };
    }
    // 空ノード文書を成功として localStorage 上書きさせない（L-002）
    if (docResult.value.nodes.length === 0) {
      return { ok: false, reason: "export-empty" };
    }
    return { ok: true, value: serializeMapDocument(docResult.value) };
  } catch {
    return { ok: false, reason: "decode-error" };
  }
}
