import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import { MSG_AWARENESS, MSG_SYNC } from "./constants.js";

export function createRoomDoc(): Y.Doc {
  return new Y.Doc();
}

export function applySeedUpdate(doc: Y.Doc, update: Uint8Array): void {
  Y.applyUpdate(doc, update, "seed");
}

export function encodeStateAsUpdate(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc);
}

export function createAwareness(doc: Y.Doc): awarenessProtocol.Awareness {
  return new awarenessProtocol.Awareness(doc);
}

/** 新規接続向け: sync step1 */
export function encodeSyncStep1(doc: Y.Doc): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MSG_SYNC);
  syncProtocol.writeSyncStep1(encoder, doc);
  return encoding.toUint8Array(encoder);
}

/** 文書 update を sync メッセージに包む（純変換） */
export function encodeSyncUpdate(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MSG_SYNC);
  syncProtocol.writeUpdate(encoder, update);
  return encoding.toUint8Array(encoder);
}

export type InboundMessageKind = "sync" | "awareness" | "unknown";

export function classifyMessage(data: Uint8Array): InboundMessageKind {
  try {
    const decoder = decoding.createDecoder(data);
    const type = decoding.readVarUint(decoder);
    if (type === MSG_SYNC) return "sync";
    if (type === MSG_AWARENESS) return "awareness";
    return "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * クライアント sync メッセージを適用し、応答バイナリ（あれば）を返す。
 */
export function handleSyncMessage(
  doc: Y.Doc,
  data: Uint8Array,
): Uint8Array | null {
  const decoder = decoding.createDecoder(data);
  decoding.readVarUint(decoder); // type
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MSG_SYNC);
  const messageType = syncProtocol.readSyncMessage(decoder, encoder, doc, null);
  // step2 や update の応答が空なら送らない
  if (encoding.length(encoder) > 1) {
    return encoding.toUint8Array(encoder);
  }
  // messageType 未使用だが read 副作用のため参照
  void messageType;
  return null;
}

export function handleAwarenessMessage(
  awareness: awarenessProtocol.Awareness,
  data: Uint8Array,
): void {
  const decoder = decoding.createDecoder(data);
  decoding.readVarUint(decoder);
  awarenessProtocol.applyAwarenessUpdate(
    awareness,
    decoding.readVarUint8Array(decoder),
    null,
  );
}

export function encodeAwarenessUpdate(
  awareness: awarenessProtocol.Awareness,
  changedClients: number[],
): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MSG_AWARENESS);
  encoding.writeVarUint8Array(
    encoder,
    awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients),
  );
  return encoding.toUint8Array(encoder);
}

export { awarenessProtocol, Y };
