import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";

export const MSG_SYNC = 0;
export const MSG_AWARENESS = 1;

/** WS 経由で適用した更新の origin（ローカル Undo 対象外・再送しない） */
export const COLLAB_REMOTE_WS_ORIGIN = "remote-ws";

export function createCollabAwareness(doc: Y.Doc): awarenessProtocol.Awareness {
  return new awarenessProtocol.Awareness(doc);
}

export function encodeSyncStep1(doc: Y.Doc): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MSG_SYNC);
  syncProtocol.writeSyncStep1(encoder, doc);
  return encoding.toUint8Array(encoder);
}

export function encodeSyncUpdate(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MSG_SYNC);
  syncProtocol.writeUpdate(encoder, update);
  return encoding.toUint8Array(encoder);
}

export type InboundMessageKind = "sync" | "awareness" | "unknown";

export function classifyCollabMessage(data: Uint8Array): InboundMessageKind {
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

/** 受信 sync を適用し、応答があれば返す */
export function handleCollabSyncMessage(doc: Y.Doc, data: Uint8Array): Uint8Array | null {
  const decoder = decoding.createDecoder(data);
  decoding.readVarUint(decoder);
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MSG_SYNC);
  syncProtocol.readSyncMessage(decoder, encoder, doc, COLLAB_REMOTE_WS_ORIGIN);
  if (encoding.length(encoder) > 1) {
    return encoding.toUint8Array(encoder);
  }
  return null;
}

export function handleCollabAwarenessMessage(
  awareness: awarenessProtocol.Awareness,
  data: Uint8Array,
): void {
  const decoder = decoding.createDecoder(data);
  decoding.readVarUint(decoder);
  awarenessProtocol.applyAwarenessUpdate(
    awareness,
    decoding.readVarUint8Array(decoder),
    COLLAB_REMOTE_WS_ORIGIN,
  );
}

export function encodeCollabAwarenessUpdate(
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
