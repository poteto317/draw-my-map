import { createMapIndexEntry, encodeMapIndex } from "@/domain/mapLibrary/mapIndex";
import { decodeBranchMoveJournal } from "../branchMoveJournal";
const index = { version: 1 as const, currentMapId: "source", maps: ["source", "target"].map(id => createMapIndexEntry(id, id, "2026-10-31T00:00:00.000Z")), legacyCleanupPending: false };
const input = { sourceId: "source", targetId: "target", sourceBefore: "source original", targetBefore: null, indexBefore: encodeMapIndex(index), sourceAfter: "source after", targetAfter: "target after", indexAfter: encodeMapIndex({ ...index, currentMapId: "target" }) };
const journal = JSON.stringify({ version: 1, sourceId: input.sourceId, targetId: input.targetId, sourceBefore: input.sourceBefore, targetBefore: input.targetBefore, indexBefore: input.indexBefore });
it("journalの原文を読む", () => { expect(decodeBranchMoveJournal(journal)).not.toBeNull(); });
it("移動先が一覧に無く本体も無い枝切り出しの journal を読む", () => {
  const extractIndex = { version: 1 as const, currentMapId: "source", maps: [createMapIndexEntry("source", "source", "2026-10-31T00:00:00.000Z")], legacyCleanupPending: false };
  const raw = JSON.stringify({
    version: 1,
    sourceId: "source",
    targetId: "brand-new",
    sourceBefore: "{}",
    targetBefore: null,
    indexBefore: encodeMapIndex(extractIndex),
  });
  expect(decodeBranchMoveJournal(raw)).not.toBeNull();
});
it("補正が要るindexの原文も受け付け、原文のまま返す", () => {
  const raw = JSON.stringify({ version: 1, currentMapId: "source", maps: index.maps });
  expect(decodeBranchMoveJournal(JSON.stringify({ ...JSON.parse(journal), indexBefore: raw }))?.indexBefore).toBe(raw);
});
it("一覧に無い移動先で targetBefore が null でない journal は拒否する", () => {
  const extractIndex = { version: 1 as const, currentMapId: "source", maps: [createMapIndexEntry("source", "source", "2026-10-31T00:00:00.000Z")], legacyCleanupPending: false };
  const raw = JSON.stringify({
    version: 1,
    sourceId: "source",
    targetId: "missing",
    sourceBefore: "{}",
    targetBefore: "{}",
    indexBefore: encodeMapIndex(extractIndex),
  });
  expect(decodeBranchMoveJournal(raw)).toBeNull();
});
it.each([{ version: 2 }, { sourceId: "bad.key" }, { targetId: "source" }, { targetBefore: 3 }, { indexBefore: "{}" }, { indexBefore: encodeMapIndex({ ...index, currentMapId: "target" }) }, { arbitraryKey: "secret" }, { sourceBefore: undefined }])("不正journal拒否 %j", change => {
  expect(decodeBranchMoveJournal(JSON.stringify({ ...JSON.parse(journal), ...change }))).toBeNull();
});
