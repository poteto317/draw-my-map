import { INITIAL_VIEWPORT } from "@/types/viewport";
import { encodeMapIndex } from "@/domain/mapLibrary/mapIndex";
import { UNKNOWN_MAP_TIMESTAMP } from "@/domain/mapLibrary/mapTimestamp";
import {
  cleanupTrashedMapViewBookmarks,
  mapViewBookmarkKey,
  migrateMapViewBookmarks,
  readMapViewBookmarks,
  updateMapViewBookmarks,
} from "@/services/persistence/mapViewBookmarkStorage";
import { MAP_INDEX_STORAGE_KEY } from "@/services/persistence/mapLibraryStorage";
import { createRecordingStorage } from "@/testing/mapLibraryTestStorage";
import type { MapViewSnapshot } from "@/types/mapViewSnapshot";

const identity = { id: "map-1", createdAt: "2026-11-20T00:00:00.000Z" };
const snapshot: MapViewSnapshot = {
  viewport: INITIAL_VIEWPORT,
  selectedNodeId: 1,
  selectedNodeIds: [1, 2],
  collapsedNodeIds: [2],
  focusRootId: 1,
  resolutionMode: "auto",
  autoResolutionLevel: "medium",
};
const backupRaw = JSON.stringify({ version: 1, bookmarks: [{ name: "遠景", snapshot }] });

it("直前の保存値を読み、名前を検証してから保存と削除を行う", () => {
  const { storage } = createRecordingStorage();
  const save = (name: string) => updateMapViewBookmarks(storage, identity, { kind: "save", name, snapshot });
  expect(save("  ")).toEqual({ ok: false, reason: "empty-name" });
  expect(save("  遠景  ")).toEqual({ ok: true, bookmarks: [{ name: "遠景", snapshot }] });
  expect(save("遠景")).toEqual({ ok: false, reason: "duplicate-name" });
  expect(save("近景")).toEqual({ ok: true, bookmarks: [{ name: "遠景", snapshot }, { name: "近景", snapshot }] });
  expect(readMapViewBookmarks(storage, { ...identity, id: "map-2" })).toEqual({ ok: true, bookmarks: [] });
  expect(readMapViewBookmarks(storage, { ...identity, createdAt: "2026-11-21T00:00:00.000Z" }))
    .toEqual({ ok: true, bookmarks: [] });
  expect(updateMapViewBookmarks(storage, identity, { kind: "delete", name: "遠景" }))
    .toEqual({ ok: true, bookmarks: [{ name: "近景", snapshot }] });
});

it.each([
  "壊れた JSON",
  JSON.stringify({ version: 2, bookmarks: [] }),
  JSON.stringify({ version: 1, bookmarks: [{ name: "遠景", snapshot: { ...snapshot, viewport: { ...INITIAL_VIEWPORT, scale: 0 } } }] }),
  JSON.stringify({ version: 1, bookmarks: [{ name: "遠景", snapshot: { ...snapshot, selectedNodeIds: [1, "2"] } }] }),
])("壊れた保存値を上書きしない", (raw) => {
  const key = mapViewBookmarkKey(identity)!;
  const { storage, operations } = createRecordingStorage({ initial: { [key]: raw } });
  expect(updateMapViewBookmarks(storage, identity, { kind: "save", name: "近景", snapshot }).ok).toBe(false);
  expect(storage.getItem(key)).toBe(raw);
  expect(operations).toEqual([]);
});

it("読み込み失敗時は書き込まず、書き込み失敗時は元の保存値を保持する", () => {
  const key = mapViewBookmarkKey(identity)!;
  const raw = JSON.stringify({ version: 1, bookmarks: [{ name: "遠景", snapshot }] });
  const blocked = createRecordingStorage({ failGetItem: true });
  const full = createRecordingStorage({ initial: { [key]: raw }, failSetItem: () => true });
  const change = { kind: "save", name: "近景", snapshot } as const;
  expect(updateMapViewBookmarks(blocked.storage, identity, change)).toEqual({ ok: false, reason: "read" });
  expect(blocked.operations).toEqual([]);
  expect(updateMapViewBookmarks(full.storage, identity, change)).toEqual({ ok: false, reason: "write" });
  expect(full.storage.getItem(key)).toBe(raw);
});

it.each(["", "not-iso", UNKNOWN_MAP_TIMESTAMP])(
  "作成日時を取得できない識別子は unavailable として保存も読取もしない (%s)",
  (createdAt) => {
    const { storage, operations } = createRecordingStorage();
    expect(mapViewBookmarkKey({ id: "map-1", createdAt })).toBeNull();
    expect(readMapViewBookmarks(storage, { id: "map-1", createdAt }))
      .toEqual({ ok: false, reason: "unavailable" });
    expect(updateMapViewBookmarks(storage, { id: "map-1", createdAt }, { kind: "save", name: "遠景", snapshot }))
      .toEqual({ ok: false, reason: "unavailable" });
    expect(operations).toEqual([]);
  },
);

it("移行は行き先の既存データを守り、新キー書き込み成功後だけ旧キーを消す", () => {
  const source = mapViewBookmarkKey({ id: "old", createdAt: identity.createdAt })!;
  const destination = mapViewBookmarkKey({ id: "new", createdAt: identity.createdAt })!;
  const occupied = createRecordingStorage({
    initial: { [source]: backupRaw, [destination]: backupRaw.replace("遠景", "既存") },
  });
  expect(migrateMapViewBookmarks(occupied.storage, { originalMapId: "old", createdAt: identity.createdAt }, "new"))
    .toBe(false);
  expect(occupied.storage.getItem(source)).toBe(backupRaw);
  expect(occupied.storage.getItem(destination)).toBe(backupRaw.replace("遠景", "既存"));

  const writeFail = createRecordingStorage({
    initial: { [source]: backupRaw },
    failSetItem: (key) => key === destination,
  });
  expect(migrateMapViewBookmarks(writeFail.storage, { originalMapId: "old", createdAt: identity.createdAt }, "new"))
    .toBe(false);
  expect(writeFail.storage.getItem(source)).toBe(backupRaw);
  expect(writeFail.storage.getItem(destination)).toBeNull();

  const removeFail = createRecordingStorage({
    initial: { [source]: backupRaw },
    failRemoveItem: (key) => key === source,
  });
  expect(migrateMapViewBookmarks(removeFail.storage, { originalMapId: "old", createdAt: identity.createdAt }, "new"))
    .toBe(false);
  expect(removeFail.storage.getItem(destination)).toBe(backupRaw);
  expect(removeFail.storage.getItem(source)).toBe(backupRaw);

  const ok = createRecordingStorage({ initial: { [source]: backupRaw } });
  expect(migrateMapViewBookmarks(ok.storage, { originalMapId: "old", createdAt: identity.createdAt }, "new")).toBe(true);
  expect(ok.storage.getItem(source)).toBeNull();
  expect(ok.storage.getItem(destination)).toBe(backupRaw);
});

it("掃除はアクティブ／残存ゴミ箱が持つキーと、破損インデックスでは何も消さない", () => {
  const deleted = { originalMapId: "gone", createdAt: identity.createdAt };
  const remaining = { originalMapId: "kept-trash", createdAt: identity.createdAt };
  const active = {
    id: "active",
    name: "残るマップ",
    createdAt: identity.createdAt,
    updatedAt: identity.createdAt,
  };
  const deletedKey = mapViewBookmarkKey({ id: deleted.originalMapId, createdAt: deleted.createdAt })!;
  const remainingKey = mapViewBookmarkKey({ id: remaining.originalMapId, createdAt: remaining.createdAt })!;
  const activeKey = mapViewBookmarkKey(active)!;
  const unrelatedKey = mapViewBookmarkKey({ id: "unrelated", createdAt: identity.createdAt })!;

  const ok = createRecordingStorage({
    initial: {
      [MAP_INDEX_STORAGE_KEY]: encodeMapIndex({
        version: 1,
        currentMapId: active.id,
        maps: [active],
        legacyCleanupPending: false,
      }),
      [deletedKey]: backupRaw,
      [remainingKey]: backupRaw,
      [activeKey]: backupRaw,
      [unrelatedKey]: backupRaw,
    },
  });
  expect(cleanupTrashedMapViewBookmarks(ok.storage, [deleted], [remaining])).toBe(true);
  expect(ok.storage.getItem(deletedKey)).toBeNull();
  expect(ok.storage.getItem(remainingKey)).toBe(backupRaw);
  expect(ok.storage.getItem(activeKey)).toBe(backupRaw);
  expect(ok.storage.getItem(unrelatedKey)).toBe(backupRaw);

  const corrupt = createRecordingStorage({
    initial: {
      [MAP_INDEX_STORAGE_KEY]: "{broken",
      [deletedKey]: backupRaw,
    },
  });
  expect(cleanupTrashedMapViewBookmarks(corrupt.storage, [deleted], [])).toBe(false);
  expect(corrupt.storage.getItem(deletedKey)).toBe(backupRaw);
});
