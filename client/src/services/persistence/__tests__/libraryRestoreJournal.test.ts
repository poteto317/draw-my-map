import { createMapIndexEntry, encodeMapIndex } from "@/domain/mapLibrary/mapIndex";
import {
  decodeLibraryRestoreJournal,
  encodeLibraryRestoreJournal,
  LIBRARY_RESTORE_JOURNAL_KEY,
  type LibraryRestoreJournal,
} from "../libraryRestoreJournal";

const date = "2026-11-05T00:00:00.000Z";
const original = createMapIndexEntry("original", "元のマップ", date);
const imported = createMapIndexEntry("imported", "追加マップ", date);
const before = { version: 1 as const, currentMapId: "original", maps: [original], legacyCleanupPending: false };
const after = { ...before, maps: [original, imported] };
const documentJson = '{"version":3,"layoutMode":"manual","nodes":[]}';
const journal: LibraryRestoreJournal = {
  format: "draw-my-map-library-restore",
  version: 1,
  indexBefore: encodeMapIndex(before),
  indexAfter: encodeMapIndex(after),
  bodies: [{ id: "imported", json: documentJson }],
};

function decodeChange(change: Record<string, unknown>) {
  return decodeLibraryRestoreJournal(JSON.stringify({ ...journal, ...change }));
}

it("正常な記録を原文付きで往復できる", () => {
  expect(LIBRARY_RESTORE_JOURNAL_KEY).toBe("draw-my-map.library-restore.v1");
  expect(decodeLibraryRestoreJournal(encodeLibraryRestoreJournal(journal))).toEqual(journal);
});

it.each([
  ["壊れたJSON", "{"],
  ["配列", "[]"],
  ["形式の改竄", JSON.stringify({ ...journal, format: "other" })],
  ["版の改竄", JSON.stringify({ ...journal, version: 2 })],
  ["必要フィールドの欠落", JSON.stringify({ ...journal, indexBefore: undefined })],
])("%sを拒否する", (_name, raw) => {
  expect(decodeLibraryRestoreJournal(raw)).toBeNull();
});

it.each([
  ["空のbody一覧", []],
  ["重複ID", [journal.bodies[0], journal.bodies[0]]],
  ["旧IDの再利用", [{ id: "original", json: documentJson }]],
  ["不正ID", [{ id: "bad.id", json: documentJson }]],
  ["空文字のbody", [{ id: "imported", json: "" }]],
  ["不正JSONのbody", [{ id: "imported", json: "{" }]],
  ["V2のbody", [{ id: "imported", json: '{"version":2,"layoutMode":"manual","nodes":[]}' }]],
])("%sを拒否する", (_name, bodies) => {
  expect(decodeChange({ bodies })).toBeNull();
});

it.each([
  ["current IDの変更", { ...after, currentMapId: "imported" }],
  ["旧行の変更", { ...after, maps: [{ ...original, name: "改竄" }, imported] }],
  ["旧行の削除", { ...after, maps: [imported] }],
  ["bodyと異なる新行", { ...after, maps: [original, createMapIndexEntry("other", "他", date)] }],
  ["bodyの無い新行", { ...after, maps: [original, imported, createMapIndexEntry("other", "他", date)] }],
  ["旧行の順序変更", { ...after, maps: [imported, original] }],
])("%sを拒否する", (_name, changedAfter) => {
  expect(decodeChange({ indexAfter: encodeMapIndex(changedAfter) })).toBeNull();
});

it("補正が必要な操作前・操作後の一覧を拒否する", () => {
  const needsRepair = JSON.stringify({ version: 1, currentMapId: "original", maps: [original] });
  expect(decodeChange({ indexBefore: needsRepair })).toBeNull();
  expect(decodeChange({ indexAfter: needsRepair })).toBeNull();
});

it("一覧内の余分なキーを拒否し、保存先の一覧へ伝搬させない", () => {
  expect(decodeChange({ indexBefore: JSON.stringify({ ...before, injected: "secret" }) })).toBeNull();
  expect(decodeChange({ indexAfter: JSON.stringify({ ...after, maps: [original, { ...imported, injected: "secret" }] }) })).toBeNull();
});

it("余分なキーはdecode結果と再保存した記録に伝搬させない", () => {
  const raw = JSON.stringify({
    ...journal,
    injected: "top-secret",
    bodies: [{ id: "imported", json: documentJson, injected: "body-secret" }],
  });
  const decoded = decodeLibraryRestoreJournal(raw);
  expect(decoded).toEqual(journal);
  expect(decoded && JSON.parse(encodeLibraryRestoreJournal(decoded))).toEqual(journal);
});

it("bodyのJSON内の余分なキーは原文の証拠として保持する", () => {
  const withExtra = JSON.stringify({ version: 3, layoutMode: "manual", nodes: [], injected: "secret" });
  expect(decodeChange({ bodies: [{ id: "imported", json: withExtra }] })?.bodies).toEqual([
    { id: "imported", json: withExtra },
  ]);
});

it("空白・改行・キー順が異なる有効なV3 bodyも原文で往復する", () => {
  const nonCanonicalJson = '{\n  "nodes": [],\n  "layoutMode": "manual",\n  "version": 3\n}';
  const record = { ...journal, bodies: [{ id: "imported", json: nonCanonicalJson }] };
  expect(decodeLibraryRestoreJournal(encodeLibraryRestoreJournal(record))).toEqual(record);
});
