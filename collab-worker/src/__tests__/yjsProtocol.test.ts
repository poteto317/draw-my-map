import { encodeSyncUpdate, classifyMessage } from "../yjsProtocol.js";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import { MSG_SYNC } from "../constants.js";

describe("encodeSyncUpdate", () => {
  it("sync update メッセージとして分類できる", () => {
    const doc = new Y.Doc();
    doc.getMap("m").set("k", 1);
    const update = Y.encodeStateAsUpdate(doc);
    const msg = encodeSyncUpdate(update);
    expect(classifyMessage(msg)).toBe("sync");

    const decoder = decoding.createDecoder(msg);
    expect(decoding.readVarUint(decoder)).toBe(MSG_SYNC);
    const encoder = encoding.createEncoder();
    syncProtocol.readSyncMessage(decoder, encoder, new Y.Doc(), null);
  });
});
