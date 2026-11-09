import { encodeMapIndex, type MapIndexV1 } from "@/domain/mapLibrary/mapIndex";
import { MAP_INDEX_STORAGE_KEY, mapBodyKey, type MapLibraryStorage } from "@/services/persistence/mapLibraryStorage";
import { BRANCH_MOVE_JOURNAL_KEY } from "@/services/persistence/branchMoveJournal";
import { LIBRARY_RESTORE_JOURNAL_KEY } from "@/services/persistence/libraryRestoreJournal";
import { createTestStorageSession } from "@/testing/createTestStorageSession";
import type { MapBackupSnapshot } from "@/types/mapStorageSession";
import { isLibraryBackupPreviewCurrent, prepareLibraryBackup } from "../libraryBackupExport";

const now = new Date("2026-11-06T09:05:07.000Z");
const date = "2026-11-05T00:00:00.000Z";
const empty = JSON.stringify({ version: 3, layoutMode: "manual", nodes: [] });
const edited = JSON.stringify({ version: 3, layoutMode: "manual", nodes: [
  { id: 1, parentId: null, x: 0, y: 0, width: 100, height: 80, label: "最新", importance: "medium" },
] });
const index: MapIndexV1 = { version: 1, currentMapId: "a", maps: [
  { id: "a", name: "現在", createdAt: date, updatedAt: date },
  { id: "b", name: "新規マップ", createdAt: date, updatedAt: date },
], legacyCleanupPending: false };

function fixture(input: Record<string, string> = {}) {
  const entries = new Map(Object.entries({ [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index), ...input }));
  const storage: MapLibraryStorage = {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, value); },
    removeItem: (key) => { entries.delete(key); },
    key: (position) => [...entries.keys()][position] ?? null,
    get length() { return entries.size; },
  };
  const testSession = createTestStorageSession({ mapId: "a" });
  let snapshot: MapBackupSnapshot = { json: edited, hydrated: true, restoreOrigin: "restored", hasSavedBodyThisMount: false };
  testSession.session.registerBackupSnapshot(() => snapshot);
  return { storage, entries, session: testSession.session, setSnapshot: (value: MapBackupSnapshot) => { snapshot = value; } };
}

function preview(f = fixture()) {
  const result = prepareLibraryBackup(f.storage, index, f.session, now);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

it("保存待ち中は保存済み本体より最新 editor snapshot を採り、欠損は準備だけで名前を出す", () => {
  const f = fixture({ [mapBodyKey("a")]: empty });
  const value = preview(f);
  expect(JSON.parse(value.json).maps.map((map: { document: unknown }) => map.document)).toEqual([
    JSON.parse(edited), JSON.parse(empty),
  ]);
  expect(value.currentSnapshotJson).toBe(edited);
  expect(value.missingBodyNames).toEqual(["新規マップ"]);
  expect(value.fileNameDate).toBe(now);
  expect(value.session).toBe(f.session);
});

it("初回復元失敗は同一 mount の保存成功前に拒否し、成功後の新しい編集は採る", () => {
  const f = fixture({ [mapBodyKey("b")]: empty });
  f.setSnapshot({ json: empty, hydrated: true, restoreOrigin: "failed", hasSavedBodyThisMount: false });
  expect(prepareLibraryBackup(f.storage, index, f.session, now).ok).toBe(false);
  f.setSnapshot({ json: edited, hydrated: true, restoreOrigin: "failed", hasSavedBodyThisMount: true });
  expect(JSON.parse(preview(f).json).maps[0].document).toEqual(JSON.parse(edited));
  f.setSnapshot({ json: empty, hydrated: true, restoreOrigin: "failed", hasSavedBodyThisMount: true });
  expect(JSON.parse(preview(f).json).maps[0].document).toEqual(JSON.parse(empty));
});

it("準備中に初回復元失敗の未保存 snapshot へ変われば書き出さない", () => {
  const f = fixture({ [mapBodyKey("b")]: empty });
  const read = f.session.readBackupSnapshot;
  let reads = 0;
  f.session.readBackupSnapshot = () => {
    if (++reads === 2) f.setSnapshot({ json: edited, hydrated: true, restoreOrigin: "failed", hasSavedBodyThisMount: false });
    return read();
  };
  expect(prepareLibraryBackup(f.storage, index, f.session, now).ok).toBe(false);
  expect(reads).toBe(2);
});

it.each([
  ["復元中", { json: edited, hydrated: false, restoreOrigin: null, hasSavedBodyThisMount: false }],
  ["復元結果未確定", { json: edited, hydrated: true, restoreOrigin: null, hasSavedBodyThisMount: false }],
  ["不正 snapshot", { json: "{secret", hydrated: true, restoreOrigin: "restored", hasSavedBodyThisMount: false }],
] as const)("%sの snapshot を拒否する", (_label, snapshot) => {
  const f = fixture();
  f.setSnapshot(snapshot);
  const result = prepareLibraryBackup(f.storage, index, f.session, now);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).not.toContain("secret");
});

it("未登録 session と現在 map ID の違う session を拒否する", () => {
  const f = fixture();
  expect(prepareLibraryBackup(f.storage, index, createTestStorageSession({ mapId: "a" }).session, now).ok).toBe(false);
  expect(prepareLibraryBackup(f.storage, index, createTestStorageSession({ mapId: "b" }).session, now).ok).toBe(false);
});

it("現在本体 null は editor snapshot を採り、別マップ null と孤立本体は件数を示す", () => {
  const f = fixture({ [mapBodyKey("orphan")]: empty, [mapBodyKey("bad id")]: empty });
  const value = preview(f);
  expect(value.missingBodyNames).toEqual(["新規マップ"]);
  expect(value.orphanBodyCount).toBe(2);
  expect(JSON.parse(value.json).maps).toHaveLength(2);
});

it("保存済みの別マップ V1 本体は既存 codec で V3 に変換する", () => {
  const f = fixture({ [mapBodyKey("b")]: JSON.stringify({ version: 1, layoutMode: "manual", nodes: [] }) });
  const value = preview(f);
  expect(JSON.parse(value.json).maps[1].document).toEqual(JSON.parse(empty));
  expect(value.missingBodyNames).toEqual([]);
});

it.each(["{secret", JSON.stringify({ version: 3, layoutMode: "manual", nodes: "broken" })])(
  "別マップの不正本体を全体拒否し、対象名だけを知らせる", (body) => {
    const f = fixture({ [mapBodyKey("b")]: body });
    const result = prepareLibraryBackup(f.storage, index, f.session, now);
    expect(result.ok).toBe(false);
    if (!result.ok) { expect(result.error).toContain("新規マップ"); expect(result.error).not.toContain(body); }
  },
);

it("別マップの読取例外とキー列挙例外を拒否する", () => {
  const f = fixture();
  const get = f.storage.getItem;
  f.storage.getItem = (key) => { if (key === mapBodyKey("b")) throw new Error("secret"); return get(key); };
  const result = prepareLibraryBackup(f.storage, index, f.session, now);
  expect(result.ok).toBe(false);
  if (!result.ok) { expect(result.error).toContain("新規マップ"); expect(result.error).not.toContain("secret"); }
  f.storage.getItem = get;
  f.storage.key = () => { throw new Error("secret"); };
  expect(prepareLibraryBackup(f.storage, index, f.session, now).ok).toBe(false);
});

it.each([BRANCH_MOVE_JOURNAL_KEY, LIBRARY_RESTORE_JOURNAL_KEY])("%s が残る間は拒否する", (key) => {
  const f = fixture({ [key]: "journal" });
  expect(prepareLibraryBackup(f.storage, index, f.session, now).ok).toBe(false);
});

it("ジャーナル読取例外も拒否する", () => {
  const f = fixture();
  const get = f.storage.getItem;
  f.storage.getItem = (key) => { if (key === LIBRARY_RESTORE_JOURNAL_KEY) throw new Error("secret"); return get(key); };
  expect(prepareLibraryBackup(f.storage, index, f.session, now).ok).toBe(false);
});

it("修復を要する生一覧と現在一覧の不一致を拒否する", () => {
  const f = fixture();
  f.entries.set(MAP_INDEX_STORAGE_KEY, JSON.stringify({ ...index, maps: [...index.maps, { id: "a", name: "重複", createdAt: date, updatedAt: date }] }));
  expect(prepareLibraryBackup(f.storage, index, f.session, now).ok).toBe(false);
  f.entries.set(MAP_INDEX_STORAGE_KEY, encodeMapIndex({ ...index, currentMapId: "b" }));
  expect(prepareLibraryBackup(f.storage, index, f.session, now).ok).toBe(false);
});

it("準備中に生一覧が変わったら拒否する", () => {
  const f = fixture({ [mapBodyKey("b")]: empty });
  const get = f.storage.getItem;
  let indexReads = 0;
  f.storage.getItem = (key) => {
    if (key === MAP_INDEX_STORAGE_KEY && ++indexReads === 2) f.entries.set(key, encodeMapIndex({ ...index, legacyCleanupPending: true }));
    return get(key);
  };
  expect(prepareLibraryBackup(f.storage, index, f.session, now).ok).toBe(false);
});

it("確認中に session・一覧・editor 内容・ジャーナルが変わったら preview を無効化する", () => {
  const f = fixture();
  const value = preview(f);
  expect(isLibraryBackupPreviewCurrent(f.storage, index, f.session, value)).toBe(true);
  expect(isLibraryBackupPreviewCurrent(f.storage, index, createTestStorageSession({ mapId: "a" }).session, value)).toBe(false);
  f.setSnapshot({ json: empty, hydrated: true, restoreOrigin: "restored", hasSavedBodyThisMount: false });
  expect(isLibraryBackupPreviewCurrent(f.storage, index, f.session, value)).toBe(false);
  f.setSnapshot({ json: edited, hydrated: true, restoreOrigin: "restored", hasSavedBodyThisMount: false });
  f.entries.set(MAP_INDEX_STORAGE_KEY, encodeMapIndex({ ...index, legacyCleanupPending: true }));
  expect(isLibraryBackupPreviewCurrent(f.storage, index, f.session, value)).toBe(false);
  f.entries.set(MAP_INDEX_STORAGE_KEY, encodeMapIndex(index));
  f.entries.set(LIBRARY_RESTORE_JOURNAL_KEY, "journal");
  expect(isLibraryBackupPreviewCurrent(f.storage, index, f.session, value)).toBe(false);
});

it("確認時に初回復元失敗の保存実績が失われた snapshot を拒否する", () => {
  const f = fixture();
  const value = preview(f);
  f.setSnapshot({ json: edited, hydrated: true, restoreOrigin: "failed", hasSavedBodyThisMount: false });
  expect(isLibraryBackupPreviewCurrent(f.storage, index, f.session, value)).toBe(false);
});

it("1000件までは準備し、1001件を拒否する", () => {
  const maps = Array.from({ length: 1000 }, (_, i) => ({ id: i === 0 ? "a" : `id-${i}`, name: `マップ${i}`, createdAt: date, updatedAt: date }));
  const largeIndex = { ...index, maps };
  const f = fixture();
  f.entries.set(MAP_INDEX_STORAGE_KEY, encodeMapIndex(largeIndex));
  expect(prepareLibraryBackup(f.storage, largeIndex, f.session, now).ok).toBe(true);
  const overflow = { ...largeIndex, maps: [...maps, { id: "overflow", name: "余分", createdAt: date, updatedAt: date }] };
  f.entries.set(MAP_INDEX_STORAGE_KEY, encodeMapIndex(overflow));
  expect(prepareLibraryBackup(f.storage, overflow, f.session, now).ok).toBe(false);
});

it("生成 JSON が32 MiBを超えると個別書き出し経路を示して拒否する", () => {
  const f = fixture({ [mapBodyKey("b")]: JSON.stringify({ version: 3, layoutMode: "manual", nodes: [
    { id: 1, parentId: null, x: 0, y: 0, width: 100, height: 80, label: "あ".repeat(11 * 1024 * 1024), importance: "medium" },
  ] }) });
  const result = prepareLibraryBackup(f.storage, index, f.session, now);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toContain("個別");
});
