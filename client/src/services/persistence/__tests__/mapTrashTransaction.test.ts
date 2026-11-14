import {
  encodeMapIndex,
  type MapIndexEntry,
  type MapIndexV1,
} from "@/domain/mapLibrary/mapIndex";
import {
  encodeMapTrashIndex,
  type MapTrashEntry,
} from "@/domain/mapLibrary/mapTrash";
import {
  trashCorruptClearedNotice,
  trashCorruptClearFailedNotice,
  trashCorruptNotice,
  trashEmptiedNotice,
  trashEmptyFailedNotice,
  trashEmptyPartialWarningNotice,
  trashEntryNotFoundNotice,
  trashEntryPermanentlyDeletedBodyWarningNotice,
  trashEntryPermanentlyDeletedNotice,
  trashPermanentDeleteFailedNotice,
  trashRestoreBodyCorruptNotice,
  trashRestoreBodyMissingNotice,
  trashRestoreBodyReadFailedNotice,
  trashRestoredCleanupFailedNotice,
  trashRestoredNotice,
  trashRestoreIndexChangedNotice,
  trashRestoreRollbackFailedNotice,
  trashRestoreWriteFailedNotice,
} from "@/domain/mapLibrary/mapTrashMessages";
import { BRANCH_MOVE_JOURNAL_KEY } from "@/services/persistence/branchMoveJournal";
import { LIBRARY_RESTORE_JOURNAL_KEY } from "@/services/persistence/libraryRestoreJournal";
import {
  MAP_INDEX_STORAGE_KEY,
  mapBodyKey,
  type MapLibraryStorage,
} from "@/services/persistence/mapLibraryStorage";
import {
  MAP_TRASH_INDEX_KEY,
  mapTrashBodyKey,
} from "@/services/persistence/mapTrashStorage";
import {
  emptyTrashStorage,
  permanentlyDeleteTrashEntry,
  refreshTrashState,
  restoreMapFromTrash,
} from "@/services/persistence/mapTrashTransaction";
import { createRecordingStorage } from "@/testing/mapLibraryTestStorage";

const NOW = new Date("2026-11-15T00:00:00.000Z");
const EMPTY_V3 = '{"version":3,"layoutMode":"manual","nodes":[]}';

function entry(id: string, name: string, updatedAt = "2026-10-01T00:00:00.000Z"): MapIndexEntry {
  return {
    id,
    name,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt,
  };
}

function trashEntry(overrides: Partial<MapTrashEntry> & { id: string }): MapTrashEntry {
  return {
    id: overrides.id,
    originalMapId: overrides.originalMapId ?? overrides.id,
    name: overrides.name ?? `ゴミ箱 ${overrides.id}`,
    createdAt: overrides.createdAt ?? "2026-09-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-10-01T00:00:00.000Z",
    deletedAt: overrides.deletedAt ?? "2026-11-10T00:00:00.000Z",
    expiresAt: overrides.expiresAt ?? "2026-12-10T00:00:00.000Z",
    hasBody: overrides.hasBody ?? true,
  };
}

function singleMapIndex(): MapIndexV1 {
  return {
    version: 1,
    currentMapId: "only",
    maps: [entry("only", "唯一")],
    legacyCleanupPending: false,
  };
}

function idSequence(ids: readonly string[]): () => string {
  let i = 0;
  return () => ids[i++] ?? `gen-${i}`;
}

describe("mapTrashTransaction", () => {
  describe("restoreMapFromTrash", () => {
    it("元 ID が未使用なら同 ID で復元し、最後のゴミ箱項目ならゴミ箱インデックスを削除する", () => {
      const index = singleMapIndex();
      const item = trashEntry({ id: "old-1", originalMapId: "old-1", name: "復旧" });
      const { storage, entries } = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({ version: 1, items: [item] }),
          [mapTrashBodyKey("old-1")]: EMPTY_V3,
        },
      });

      const result = restoreMapFromTrash({
        storage,
        index,
        trashId: "old-1",
        now: NOW,
        generateId: idSequence(["unused"]),
      });

      expect(result).toEqual({
        ok: true,
        nextIndex: {
          ...index,
          maps: [
            ...index.maps,
            {
              id: "old-1",
              name: "復旧",
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
            },
          ],
        },
        nextTrash: { status: "ok", entries: [] },
        notice: trashRestoredNotice("復旧"),
      });
      expect(entries()[mapBodyKey("old-1")]).toBe(EMPTY_V3);
      expect(entries()[mapTrashBodyKey("old-1")]).toBeUndefined();
      expect(entries()[MAP_TRASH_INDEX_KEY]).toBeUndefined();
    });

    it("hasBody: false の項目は本体を書かずにインデックスへ復元する", () => {
      const index = singleMapIndex();
      const item = trashEntry({
        id: "empty-1",
        originalMapId: "empty-1",
        name: "空マップ",
        hasBody: false,
      });
      const { storage, entries } = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({ version: 1, items: [item] }),
        },
      });

      const result = restoreMapFromTrash({
        storage,
        index,
        trashId: "empty-1",
        now: NOW,
        generateId: idSequence(["unused"]),
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.nextIndex.maps.map((m) => m.id)).toEqual(["only", "empty-1"]);
        expect(result.notice).toEqual(trashRestoredNotice("空マップ"));
      }
      expect(entries()[mapBodyKey("empty-1")]).toBeUndefined();
    });

    it("元 ID がアクティブ一覧または孤立本体と衝突する場合は新しい ID を採番して復元する", () => {
      const index = singleMapIndex();
      const item = trashEntry({ id: "t-1", originalMapId: "only", name: "衝突" });
      const { storage, entries } = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({ version: 1, items: [item] }),
          [mapTrashBodyKey("t-1")]: EMPTY_V3,
          [mapBodyKey("orphan-id")]: EMPTY_V3,
        },
      });

      const result = restoreMapFromTrash({
        storage,
        index,
        trashId: "t-1",
        now: NOW,
        generateId: idSequence(["orphan-id", "fresh-id"]),
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.nextIndex.maps.map((m) => m.id)).toEqual(["only", "fresh-id"]);
      }
      expect(entries()[mapBodyKey("fresh-id")]).toBe(EMPTY_V3);
    });

    it("進行中ジャーナル・不在・破損・本体読取失敗/欠損/破損・readMatchingIndexRaw 不一致・ID採番不能を拒否する", () => {
      const index = singleMapIndex();
      const missingBody = trashEntry({ id: "missing" });
      const corruptBody = trashEntry({ id: "corrupt" });
      const validItem = trashEntry({ id: "valid", originalMapId: "valid" });
      const conflictItem = trashEntry({ id: "conflict", originalMapId: "only" });

      const withJournal = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({ version: 1, items: [validItem] }),
          [LIBRARY_RESTORE_JOURNAL_KEY]: "{}",
        },
      });
      expect(
        restoreMapFromTrash({
          storage: withJournal.storage,
          index,
          trashId: "valid",
          now: NOW,
          generateId: idSequence([]),
        }),
      ).toEqual({ ok: false, notice: trashRestoreWriteFailedNotice() });

      const base = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({
            version: 1,
            items: [missingBody, corruptBody, validItem, conflictItem],
          }),
          [mapTrashBodyKey("corrupt")]: "{invalid",
          [mapTrashBodyKey("valid")]: EMPTY_V3,
          [mapTrashBodyKey("conflict")]: EMPTY_V3,
        },
      });

      expect(
        restoreMapFromTrash({
          storage: base.storage,
          index,
          trashId: "unknown",
          now: NOW,
          generateId: idSequence([]),
        }),
      ).toMatchObject({ ok: false, notice: trashEntryNotFoundNotice() });

      expect(
        restoreMapFromTrash({
          storage: base.storage,
          index,
          trashId: "missing",
          now: NOW,
          generateId: idSequence([]),
        }),
      ).toMatchObject({ ok: false, notice: trashRestoreBodyMissingNotice() });

      expect(
        restoreMapFromTrash({
          storage: base.storage,
          index,
          trashId: "corrupt",
          now: NOW,
          generateId: idSequence([]),
        }),
      ).toMatchObject({ ok: false, notice: trashRestoreBodyCorruptNotice() });

      expect(
        restoreMapFromTrash({
          storage: base.storage,
          index,
          trashId: "conflict",
          now: NOW,
          generateId: () => "only",
        }),
      ).toMatchObject({ ok: false, notice: trashRestoreWriteFailedNotice() });

      const readFailStorage: MapLibraryStorage = {
        get length() {
          return base.storage.length;
        },
        key: (i) => base.storage.key(i),
        getItem: (key) => {
          if (key === mapTrashBodyKey("valid")) throw new DOMException("fail", "SecurityError");
          return base.storage.getItem(key);
        },
        setItem: (k, v) => base.storage.setItem(k, v),
        removeItem: (k) => base.storage.removeItem(k),
      };
      expect(
        restoreMapFromTrash({
          storage: readFailStorage,
          index,
          trashId: "valid",
          now: NOW,
          generateId: idSequence([]),
        }),
      ).toMatchObject({ ok: false, notice: trashRestoreBodyReadFailedNotice() });

      const staleIndex: MapIndexV1 = {
        ...index,
        maps: [entry("only", "別タブ変更")],
      };
      base.storage.setItem(MAP_INDEX_STORAGE_KEY, encodeMapIndex(staleIndex));
      expect(
        restoreMapFromTrash({
          storage: base.storage,
          index,
          trashId: "valid",
          now: NOW,
          generateId: idSequence([]),
        }),
      ).toMatchObject({ ok: false, notice: trashRestoreIndexChangedNotice() });

      base.storage.setItem(MAP_TRASH_INDEX_KEY, "{broken");
      expect(
        restoreMapFromTrash({
          storage: base.storage,
          index,
          trashId: "valid",
          now: NOW,
          generateId: idSequence([]),
        }),
      ).toEqual({
        ok: false,
        notice: trashCorruptNotice(),
        nextTrash: { status: "corrupt" },
      });
    });

    it("本体書込失敗や一覧書込失敗時は安全に失敗・ロールバックし、ロールバックも失敗したら専用エラーを返す", () => {
      const index = singleMapIndex();
      const item = trashEntry({ id: "t-1", originalMapId: "t-1" });

      const bodyWriteFail = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({ version: 1, items: [item] }),
          [mapTrashBodyKey("t-1")]: EMPTY_V3,
        },
        failSetItem: (key) => key === mapBodyKey("t-1"),
      });
      expect(
        restoreMapFromTrash({
          storage: bodyWriteFail.storage,
          index,
          trashId: "t-1",
          now: NOW,
          generateId: idSequence([]),
        }),
      ).toMatchObject({ ok: false, notice: trashRestoreWriteFailedNotice() });

      const s1 = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({ version: 1, items: [item] }),
          [mapTrashBodyKey("t-1")]: EMPTY_V3,
        },
        failSetItem: (key) => key === MAP_INDEX_STORAGE_KEY,
      });

      expect(
        restoreMapFromTrash({
          storage: s1.storage,
          index,
          trashId: "t-1",
          now: NOW,
          generateId: idSequence([]),
        }),
      ).toMatchObject({ ok: false, notice: trashRestoreWriteFailedNotice() });
      expect(s1.entries()[mapBodyKey("t-1")]).toBeUndefined();

      const s2 = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({ version: 1, items: [item] }),
          [mapTrashBodyKey("t-1")]: EMPTY_V3,
        },
        failSetItem: (key) => key === MAP_INDEX_STORAGE_KEY,
        failRemoveItem: (key) => key === mapBodyKey("t-1"),
      });

      expect(
        restoreMapFromTrash({
          storage: s2.storage,
          index,
          trashId: "t-1",
          now: NOW,
          generateId: idSequence([]),
        }),
      ).toMatchObject({ ok: false, notice: trashRestoreRollbackFailedNotice() });
    });

    it("ゴミ箱後始末だけ失敗した場合は復元済みとして warning を返す", () => {
      const index = singleMapIndex();
      const item = trashEntry({ id: "t-1", originalMapId: "t-1", name: "復旧" });
      const { storage, entries } = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({ version: 1, items: [item] }),
          [mapTrashBodyKey("t-1")]: EMPTY_V3,
        },
        failRemoveItem: (key) => key === mapTrashBodyKey("t-1"),
      });

      const result = restoreMapFromTrash({
        storage,
        index,
        trashId: "t-1",
        now: NOW,
        generateId: idSequence([]),
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.notice).toEqual(trashRestoredCleanupFailedNotice("復旧"));
        expect(result.nextIndex.maps.map((m) => m.id)).toEqual(["only", "t-1"]);
      }
      expect(entries()[mapBodyKey("t-1")]).toBe(EMPTY_V3);
    });
  });

  describe("permanentlyDeleteTrashEntry", () => {
    it("インデックス更新 → 本体削除の順で削除し、本体削除失敗時は warning を返す", () => {
      const item1 = trashEntry({ id: "t-1", name: "対象1" });
      const item2 = trashEntry({ id: "t-2", name: "対象2" });
      const s1 = createRecordingStorage({
        initial: {
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({ version: 1, items: [item1] }),
          [mapTrashBodyKey("t-1")]: EMPTY_V3,
        },
      });
      const r1 = permanentlyDeleteTrashEntry({ storage: s1.storage, trashId: "t-1", now: NOW });
      expect(r1).toEqual({
        ok: true,
        nextTrash: { status: "ok", entries: [] },
        notice: trashEntryPermanentlyDeletedNotice("対象1"),
      });
      expect(s1.operations.map((op) => [op.type, op.key])).toEqual([
        ["removeItem", MAP_TRASH_INDEX_KEY],
        ["removeItem", mapTrashBodyKey("t-1")],
      ]);

      const s2 = createRecordingStorage({
        initial: {
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({ version: 1, items: [item1, item2] }),
          [mapTrashBodyKey("t-1")]: EMPTY_V3,
          [mapTrashBodyKey("t-2")]: EMPTY_V3,
        },
        failRemoveItem: (key) => key === mapTrashBodyKey("t-1"),
      });
      const r2 = permanentlyDeleteTrashEntry({ storage: s2.storage, trashId: "t-1", now: NOW });
      expect(r2).toEqual({
        ok: true,
        nextTrash: { status: "ok", entries: [item2] },
        notice: trashEntryPermanentlyDeletedBodyWarningNotice("対象1"),
      });

      const noBody = trashEntry({ id: "t-nobody", name: "本体なし", hasBody: false });
      const s3 = createRecordingStorage({
        initial: {
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({ version: 1, items: [noBody] }),
        },
      });
      const r3 = permanentlyDeleteTrashEntry({ storage: s3.storage, trashId: "t-nobody", now: NOW });
      expect(r3).toEqual({
        ok: true,
        nextTrash: { status: "ok", entries: [] },
        notice: trashEntryPermanentlyDeletedNotice("本体なし"),
      });
      expect(s3.operations.map((op) => [op.type, op.key])).toEqual([
        ["removeItem", MAP_TRASH_INDEX_KEY],
      ]);
    });

    it("インデックス更新失敗・不在・破損・進行中ジャーナル時は安全に失敗する", () => {
      const item = trashEntry({ id: "t-1" });
      const item2 = trashEntry({ id: "t-2" });
      const failIndex = createRecordingStorage({
        initial: {
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({ version: 1, items: [item, item2] }),
          [mapTrashBodyKey("t-1")]: EMPTY_V3,
        },
        failSetItem: (key) => key === MAP_TRASH_INDEX_KEY,
      });
      expect(
        permanentlyDeleteTrashEntry({ storage: failIndex.storage, trashId: "t-1", now: NOW }),
      ).toMatchObject({ ok: false, notice: trashPermanentDeleteFailedNotice() });
      expect(failIndex.entries()[mapTrashBodyKey("t-1")]).toBe(EMPTY_V3);

      expect(
        permanentlyDeleteTrashEntry({
          storage: failIndex.storage,
          trashId: "missing",
          now: NOW,
        }),
      ).toMatchObject({ ok: false, notice: trashEntryNotFoundNotice() });

      const corrupt = createRecordingStorage({
        initial: { [MAP_TRASH_INDEX_KEY]: "{broken" },
      });
      expect(
        permanentlyDeleteTrashEntry({ storage: corrupt.storage, trashId: "t-1", now: NOW }),
      ).toEqual({
        ok: false,
        notice: trashCorruptNotice(),
        nextTrash: { status: "corrupt" },
      });

      const withJournal = createRecordingStorage({
        initial: {
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({ version: 1, items: [item] }),
          [LIBRARY_RESTORE_JOURNAL_KEY]: "{}",
        },
      });
      expect(
        permanentlyDeleteTrashEntry({ storage: withJournal.storage, trashId: "t-1", now: NOW }),
      ).toEqual({ ok: false, notice: trashPermanentDeleteFailedNotice() });
    });
  });

  describe("emptyTrashStorage", () => {
    it("通常時は登録済み本体・孤立本体・インデックスをすべて削除する", () => {
      const item = trashEntry({ id: "t-1", hasBody: true });
      const itemNoBody = trashEntry({ id: "t-2", hasBody: false });
      const { storage, entries } = createRecordingStorage({
        initial: {
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({ version: 1, items: [item, itemNoBody] }),
          [mapTrashBodyKey("t-1")]: EMPTY_V3,
          [mapTrashBodyKey("orphan")]: EMPTY_V3,
        },
      });

      const result = emptyTrashStorage(storage, "ok");

      expect(result).toEqual({
        ok: true,
        nextTrash: { status: "ok", entries: [] },
        notice: trashEmptiedNotice(),
      });
      expect(entries()).toEqual({});

      const alreadyEmpty = createRecordingStorage();
      expect(emptyTrashStorage(alreadyEmpty.storage, "ok")).toEqual({
        ok: true,
        nextTrash: { status: "ok", entries: [] },
        notice: trashEmptiedNotice(),
      });
    });

    it("進行中ジャーナル時は書き込まずに失敗を返す", () => {
      const sJournal = createRecordingStorage({
        initial: { [BRANCH_MOVE_JOURNAL_KEY]: "{}" },
      });
      expect(emptyTrashStorage(sJournal.storage, "ok")).toEqual({
        ok: false,
        notice: trashEmptyFailedNotice(),
      });
    });

    it("登録本体の削除失敗や孤立本体の削除失敗時は残余状態を正確に返す", () => {
      const item1 = trashEntry({ id: "t-1", hasBody: true });
      const item2 = trashEntry({ id: "t-2", hasBody: true });
      const partialFail = createRecordingStorage({
        initial: {
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({ version: 1, items: [item1, item2] }),
          [mapTrashBodyKey("t-1")]: EMPTY_V3,
          [mapTrashBodyKey("t-2")]: EMPTY_V3,
        },
        failRemoveItem: (key) => key === mapTrashBodyKey("t-2"),
      });
      expect(emptyTrashStorage(partialFail.storage, "ok")).toEqual({
        ok: false,
        nextTrash: { status: "ok", entries: [item2] },
        notice: trashEmptyPartialWarningNotice(),
      });

      const allBodyFail = createRecordingStorage({
        initial: {
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({ version: 1, items: [item1] }),
          [mapTrashBodyKey("t-1")]: EMPTY_V3,
        },
        failRemoveItem: (key) => key === mapTrashBodyKey("t-1"),
      });
      expect(emptyTrashStorage(allBodyFail.storage, "ok")).toEqual({
        ok: false,
        nextTrash: { status: "ok", entries: [item1] },
        notice: trashEmptyFailedNotice(),
      });

      const orphanFail = createRecordingStorage({
        initial: {
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({ version: 1, items: [item1] }),
          [mapTrashBodyKey("t-1")]: EMPTY_V3,
          [mapTrashBodyKey("orphan")]: EMPTY_V3,
        },
        failRemoveItem: (key) => key === mapTrashBodyKey("orphan"),
      });
      expect(emptyTrashStorage(orphanFail.storage, "ok")).toEqual({
        ok: true,
        nextTrash: { status: "ok", entries: [] },
        notice: trashEmptyPartialWarningNotice(),
      });
    });

    it("collectTrashBodyKeys が例外で null を返した場合は孤立本体削除の完了と誤認せず安全に失敗する", () => {
      const baseEmpty = createRecordingStorage({
        initial: {
          [mapTrashBodyKey("orphan")]: EMPTY_V3,
        },
      });
      const failingKeyEmpty: MapLibraryStorage = {
        get length() {
          return baseEmpty.storage.length;
        },
        key() {
          throw new DOMException("blocked", "SecurityError");
        },
        getItem: (k) => baseEmpty.storage.getItem(k),
        setItem: (k, v) => baseEmpty.storage.setItem(k, v),
        removeItem: (k) => baseEmpty.storage.removeItem(k),
      };
      expect(emptyTrashStorage(failingKeyEmpty, "ok")).toEqual({
        ok: false,
        nextTrash: { status: "ok", entries: [] },
        notice: trashEmptyFailedNotice(),
      });

      const item = trashEntry({ id: "t-1", hasBody: true });
      const baseWithItem = createRecordingStorage({
        initial: {
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({ version: 1, items: [item] }),
          [mapTrashBodyKey("t-1")]: EMPTY_V3,
          [mapTrashBodyKey("orphan")]: EMPTY_V3,
        },
      });
      const failingKeyWithItem: MapLibraryStorage = {
        get length() {
          return baseWithItem.storage.length;
        },
        key() {
          throw new DOMException("blocked", "SecurityError");
        },
        getItem: (k) => baseWithItem.storage.getItem(k),
        setItem: (k, v) => baseWithItem.storage.setItem(k, v),
        removeItem: (k) => baseWithItem.storage.removeItem(k),
      };
      expect(emptyTrashStorage(failingKeyWithItem, "ok")).toEqual({
        ok: false,
        nextTrash: { status: "ok", entries: [] },
        notice: trashEmptyPartialWarningNotice(),
      });
    });

    it("破損初期化は corrupt 状態の時だけ強制削除し、ok から破損に変わっていた場合は初期化せず corrupt 通知を返す", () => {
      const sCorrupt = createRecordingStorage({
        initial: {
          [MAP_TRASH_INDEX_KEY]: "{broken",
          [mapTrashBodyKey("t-1")]: EMPTY_V3,
        },
      });
      expect(emptyTrashStorage(sCorrupt.storage, "ok")).toEqual({
        ok: false,
        nextTrash: { status: "corrupt" },
        notice: trashCorruptNotice(),
      });
      expect(sCorrupt.entries()[MAP_TRASH_INDEX_KEY]).toBe("{broken");

      expect(emptyTrashStorage(sCorrupt.storage, "corrupt")).toEqual({
        ok: true,
        nextTrash: { status: "ok", entries: [] },
        notice: trashCorruptClearedNotice(),
      });
      expect(sCorrupt.entries()).toEqual({});

      const sFailClear = createRecordingStorage({
        initial: {
          [MAP_TRASH_INDEX_KEY]: "{broken",
          [mapTrashBodyKey("t-1")]: EMPTY_V3,
        },
        failRemoveItem: () => true,
      });
      expect(emptyTrashStorage(sFailClear.storage, "corrupt")).toEqual({
        ok: false,
        nextTrash: { status: "corrupt" },
        notice: trashCorruptClearFailedNotice(),
      });
    });
  });

  describe("refreshTrashState", () => {
    it("通常時は期限切れを清掃して返し、進行中ジャーナル時は書き込まずに現在状態だけを返す", () => {
      const valid = trashEntry({
        id: "t-valid",
        deletedAt: "2026-11-12T00:00:00.000Z",
        expiresAt: "2026-12-01T00:00:00.000Z",
      });
      const expired = trashEntry({
        id: "t-expired",
        deletedAt: "2026-11-01T00:00:00.000Z",
        expiresAt: "2026-11-01T00:00:00.000Z",
      });
      const sJournal = createRecordingStorage({
        initial: {
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({ version: 1, items: [valid, expired] }),
          [BRANCH_MOVE_JOURNAL_KEY]: "{}",
        },
      });
      expect(refreshTrashState(sJournal.storage, NOW)).toEqual({
        status: "ok",
        entries: [valid, expired],
      });
      expect(sJournal.operations).toEqual([]);

      const sNormal = createRecordingStorage({
        initial: {
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({ version: 1, items: [valid, expired] }),
        },
      });
      expect(refreshTrashState(sNormal.storage, NOW)).toEqual({
        status: "ok",
        entries: [valid],
      });

      const sCorrupt = createRecordingStorage({
        initial: { [MAP_TRASH_INDEX_KEY]: "{broken" },
      });
      expect(refreshTrashState(sCorrupt.storage, NOW)).toEqual({ status: "corrupt" });
    });
  });
});
