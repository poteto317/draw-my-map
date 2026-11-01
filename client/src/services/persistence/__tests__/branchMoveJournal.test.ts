import { createMapIndexEntry, encodeMapIndex } from "@/domain/mapLibrary/mapIndex";
import { decodeBranchMoveJournal } from "../branchMoveJournal";
const index = { version: 1 as const, currentMapId: "source", maps: ["source", "target"].map(id => createMapIndexEntry(id, id, "2026-10-31T00:00:00.000Z")), legacyCleanupPending: false };
const input = { sourceId: "source", targetId: "target", sourceBefore: "source original", targetBefore: null, indexBefore: encodeMapIndex(index), sourceAfter: "source after", targetAfter: "target after", indexAfter: encodeMapIndex({ ...index, currentMapId: "target" }) };
const journal = JSON.stringify({ version: 1, sourceId: input.sourceId, targetId: input.targetId, sourceBefore: input.sourceBefore, targetBefore: input.targetBefore, indexBefore: input.indexBefore });
it("journalの原文を読む", () => { expect(decodeBranchMoveJournal(journal)).not.toBeNull(); });
it("補正が要るindexの原文も受け付け、原文のまま返す", () => {
  const raw = JSON.stringify({ version: 1, currentMapId: "source", maps: index.maps });
  expect(decodeBranchMoveJournal(JSON.stringify({ ...JSON.parse(journal), indexBefore: raw }))?.indexBefore).toBe(raw);
});
it.each([{ version: 2 }, { sourceId: "bad.key" }, { targetId: "source" }, { targetBefore: 3 }, { indexBefore: "{}" }, { indexBefore: encodeMapIndex({ ...index, currentMapId: "target" }) }, { arbitraryKey: "secret" }, { sourceBefore: undefined }])("不正journal拒否 %j", change => {
  expect(decodeBranchMoveJournal(JSON.stringify({ ...JSON.parse(journal), ...change }))).toBeNull();
});
