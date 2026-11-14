import {
  encodeMapIndex,
  type MapIndexEntry,
  type MapIndexV1,
} from "@/domain/mapLibrary/mapIndex";
import {
  currentMapDeletedNotice,
  indexWriteFailedNotice,
  lastMapDeletedNotice,
  mapDeletedNotice,
  mapIdUnavailableNotice,
} from "@/domain/mapLibrary/mapLibraryMessages";
import {
  encodeMapTrashIndex,
  type MapTrashEntry,
} from "@/domain/mapLibrary/mapTrash";
import {
  currentMapPermanentlyDeletedNotice,
  currentPermanentBodyRemovalFailedNotice,
  lastMapPermanentlyDeletedNotice,
  lastPermanentBodyRemovalFailedNotice,
  mapPermanentlyDeletedNotice,
  permanentBodyRemovalFailedNotice,
  trashBodyReadFailedForMoveNotice,
  trashCorruptForMoveNotice,
  trashMoveFailedNotice,
  trashMoveRollbackFailedNotice,
  trashQuotaExceededNotice,
} from "@/domain/mapLibrary/mapTrashMessages";
import { BRANCH_MOVE_JOURNAL_KEY } from "@/services/persistence/branchMoveJournal";
import { LIBRARY_RESTORE_JOURNAL_KEY } from "@/services/persistence/libraryRestoreJournal";
import {
  moveMapToTrash,
  permanentlyDeleteActiveMapIndex,
} from "@/services/persistence/mapDeleteTransaction";
import {
  MAP_INDEX_STORAGE_KEY,
  mapBodyKey,
  type MapLibraryStorage,
} from "@/services/persistence/mapLibraryStorage";
import {
  MAP_TRASH_INDEX_KEY,
  mapTrashBodyKey,
} from "@/services/persistence/mapTrashStorage";
import { createRecordingStorage } from "@/testing/mapLibraryTestStorage";
import type { MapBackupSnapshot } from "@/types/mapStorageSession";

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

function twoMapsIndex(): MapIndexV1 {
  return {
    version: 1,
    currentMapId: "map-1",
    maps: [entry("map-1", "マップ 1"), entry("map-2", "マップ 2")],
    legacyCleanupPending: false,
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

describe("mapDeleteTransaction", () => {
  describe("moveMapToTrash", () => {
    it("非現在マップをゴミ箱本体 → ゴミ箱インデックス → アクティブ一覧の順で移動する", () => {
      const index = twoMapsIndex();
      const { storage, operations, entries } = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
          [mapBodyKey("map-1")]: EMPTY_V3,
          [mapBodyKey("map-2")]: "body-2",
        },
      });

      const result = moveMapToTrash({
        storage,
        index,
        id: "map-2",
        currentMapBackupSnapshot: null,
        now: NOW,
        generateId: idSequence(["unused"]),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.plan.isCurrent).toBe(false);
      expect(result.plan.nextIndex.maps.map((m) => m.id)).toEqual(["map-1"]);
      expect(result.notices.removed).toEqual(mapDeletedNotice("マップ 2"));
      expect(result.nextTrash.status).toBe("ok");
      if (result.nextTrash.status === "ok") {
        expect(result.nextTrash.entries.map((e) => e.id)).toEqual(["map-2"]);
      }
      expect(operations.map((op) => [op.type, op.key])).toEqual([
        ["setItem", mapTrashBodyKey("map-2")],
        ["setItem", MAP_TRASH_INDEX_KEY],
        ["setItem", MAP_INDEX_STORAGE_KEY],
      ]);
      expect(entries()[mapTrashBodyKey("map-2")]).toBe("body-2");
    });

    it("現在マップに適格な未保存編集スナップショットがあれば、それをゴミ箱本体として保存する", () => {
      const index = twoMapsIndex();
      const edited = '{"version":3,"layoutMode":"auto","nodes":[]}';
      const snapshot: MapBackupSnapshot = {
        json: edited,
        hydrated: true,
        restoreOrigin: "restored",
        hasSavedBodyThisMount: false,
      };
      const { storage, entries } = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
          [mapBodyKey("map-1")]: EMPTY_V3,
          [mapBodyKey("map-2")]: EMPTY_V3,
        },
      });

      const result = moveMapToTrash({
        storage,
        index,
        id: "map-1",
        currentMapBackupSnapshot: snapshot,
        now: NOW,
        generateId: idSequence(["unused"]),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.plan.isCurrent).toBe(true);
      expect(result.notices.removed).toEqual(currentMapDeletedNotice("マップ 1", "マップ 2"));
      expect(entries()[mapTrashBodyKey("map-1")]).toBe(edited);
    });

    it("現在マップでも不適格なスナップショットは使わず保存済み本体をゴミ箱へ移す", () => {
      const index = twoMapsIndex();
      const ineligible: MapBackupSnapshot = {
        json: '{"version":3,"layoutMode":"auto","nodes":[]}',
        hydrated: false,
        restoreOrigin: "restored",
        hasSavedBodyThisMount: false,
      };
      const { storage, entries } = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
          [mapBodyKey("map-1")]: EMPTY_V3,
          [mapBodyKey("map-2")]: EMPTY_V3,
        },
      });

      const result = moveMapToTrash({
        storage,
        index,
        id: "map-1",
        currentMapBackupSnapshot: ineligible,
        now: NOW,
        generateId: idSequence(["unused"]),
      });

      expect(result.ok).toBe(true);
      expect(entries()[mapTrashBodyKey("map-1")]).toBe(EMPTY_V3);
    });

    it("現在マップが未保存・未編集の空マップのときは hasBody: false でゴミ箱本体を書かない", () => {
      const index = singleMapIndex();
      const snapshot: MapBackupSnapshot = {
        json: EMPTY_V3,
        hydrated: true,
        restoreOrigin: "empty",
        hasSavedBodyThisMount: false,
      };
      const { storage, entries } = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
        },
      });

      const result = moveMapToTrash({
        storage,
        index,
        id: "only",
        currentMapBackupSnapshot: snapshot,
        now: NOW,
        generateId: idSequence(["fresh-1"]),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.plan.nextIndex.currentMapId).toBe("fresh-1");
      expect(result.notices.removed).toEqual(lastMapDeletedNotice("唯一"));
      expect(entries()[mapTrashBodyKey("only")]).toBeUndefined();
      expect(result.nextTrash.status).toBe("ok");
      if (result.nextTrash.status === "ok") {
        expect(result.nextTrash.entries[0]?.hasBody).toBe(false);
      }
    });

    it("存在しない ID や ID 確保不能時はエラーを返しストレージを変更しない", () => {
      const two = twoMapsIndex();
      const missingStorage = createRecordingStorage({
        initial: { [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(two) },
      });
      expect(
        moveMapToTrash({
          storage: missingStorage.storage,
          index: two,
          id: "missing",
          currentMapBackupSnapshot: null,
          now: NOW,
          generateId: idSequence([]),
        }),
      ).toEqual({ ok: false, notice: indexWriteFailedNotice("マップを削除") });

      const single = singleMapIndex();
      const noMapIdStorage = createRecordingStorage({
        initial: { [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(single) },
      });
      expect(
        moveMapToTrash({
          storage: noMapIdStorage.storage,
          index: single,
          id: "only",
          currentMapBackupSnapshot: null,
          now: NOW,
          generateId: () => "only",
        }),
      ).toEqual({ ok: false, notice: mapIdUnavailableNotice() });

      const trashCollision = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(two),
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({
            version: 1,
            items: [trashEntry({ id: "map-2" })],
          }),
          [mapBodyKey("map-2")]: EMPTY_V3,
        },
      });
      expect(
        moveMapToTrash({
          storage: trashCollision.storage,
          index: two,
          id: "map-2",
          currentMapBackupSnapshot: null,
          now: NOW,
          generateId: () => "map-2",
        }),
      ).toEqual({
        ok: false,
        notice: trashMoveFailedNotice(),
        nextTrash: { status: "ok", entries: [trashEntry({ id: "map-2" })] },
      });
    });

    it("ゴミ箱インデックス書き込み失敗時は書き込んだ本体をロールバックし、QuotaExceededError なら canPermanentDelete: true を返す", () => {
      const index = twoMapsIndex();
      const { storage, entries } = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
          [mapBodyKey("map-2")]: "body-2",
        },
        failSetItem: (key) => key === MAP_TRASH_INDEX_KEY,
        failSetItemError: "QuotaExceededError",
      });

      const result = moveMapToTrash({
        storage,
        index,
        id: "map-2",
        currentMapBackupSnapshot: null,
        now: NOW,
        generateId: idSequence(["unused"]),
      });

      expect(result).toEqual({
        ok: false,
        notice: trashQuotaExceededNotice(),
        canPermanentDelete: true,
        nextTrash: { status: "ok", entries: [] },
      });
      expect(entries()[mapTrashBodyKey("map-2")]).toBeUndefined();

      const nonQuota = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
          [mapBodyKey("map-2")]: "body-2",
        },
        failSetItem: (key) => key === MAP_TRASH_INDEX_KEY,
        failSetItemError: "SecurityError",
      });
      expect(
        moveMapToTrash({
          storage: nonQuota.storage,
          index,
          id: "map-2",
          currentMapBackupSnapshot: null,
          now: NOW,
          generateId: idSequence(["unused"]),
        }),
      ).toEqual({
        ok: false,
        notice: trashMoveFailedNotice(),
        nextTrash: { status: "ok", entries: [] },
      });
      expect(nonQuota.entries()[mapTrashBodyKey("map-2")]).toBeUndefined();
    });

    it("アクティブ一覧書き込み失敗時は先にゴミ箱本体を消してから既存ゴミ箱インデックスを戻し、QuotaExceededError で canPermanentDelete: true を返す", () => {
      const index = twoMapsIndex();
      const existing = trashEntry({ id: "old-t" });
      const rawBefore = encodeMapTrashIndex({ version: 1, items: [existing] });
      const { storage, operations, entries } = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
          [mapBodyKey("map-2")]: "body-2",
          [MAP_TRASH_INDEX_KEY]: rawBefore,
          [mapTrashBodyKey("old-t")]: EMPTY_V3,
        },
        failSetItem: (key) => key === MAP_INDEX_STORAGE_KEY,
        failSetItemError: "QuotaExceededError",
      });

      const result = moveMapToTrash({
        storage,
        index,
        id: "map-2",
        currentMapBackupSnapshot: null,
        now: NOW,
        generateId: idSequence(["unused"]),
      });

      expect(result).toEqual({
        ok: false,
        notice: indexWriteFailedNotice("マップを削除"),
        canPermanentDelete: true,
        nextTrash: { status: "ok", entries: [existing] },
      });
      expect(operations.map((op) => [op.type, op.key])).toEqual([
        ["setItem", mapTrashBodyKey("map-2")],
        ["setItem", MAP_TRASH_INDEX_KEY],
        ["setItem", MAP_INDEX_STORAGE_KEY],
        ["removeItem", mapTrashBodyKey("map-2")],
        ["setItem", MAP_TRASH_INDEX_KEY],
      ]);
      expect(entries()[MAP_TRASH_INDEX_KEY]).toBe(rawBefore);
      expect(entries()[mapTrashBodyKey("map-2")]).toBeUndefined();
    });

    it("ゴミ箱内に同じ ID が既にあるときは新しいゴミ箱 ID を採番し、既存項目を残す", () => {
      const index = twoMapsIndex();
      const existing = trashEntry({ id: "map-2", originalMapId: "map-2" });
      const { storage, entries } = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
          [mapBodyKey("map-1")]: EMPTY_V3,
          [mapBodyKey("map-2")]: "body-2",
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({ version: 1, items: [existing] }),
          [mapTrashBodyKey("map-2")]: EMPTY_V3,
        },
      });

      const result = moveMapToTrash({
        storage,
        index,
        id: "map-2",
        currentMapBackupSnapshot: null,
        now: NOW,
        generateId: idSequence(["trash-new"]),
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.nextTrash).toEqual({
          status: "ok",
          entries: expect.arrayContaining([
            existing,
            expect.objectContaining({ id: "trash-new", originalMapId: "map-2" }),
          ]),
        });
      }
      expect(entries()[mapTrashBodyKey("map-2")]).toBe(EMPTY_V3);
      expect(entries()[mapTrashBodyKey("trash-new")]).toBe("body-2");
    });

    it("アクティブ一覧更新失敗時のロールバックでゴミ箱インデックス書き戻しにも失敗したら、実ストレージ状態へ nextTrash を同期する", () => {
      const index = twoMapsIndex();
      const existing = trashEntry({ id: "old-t" });
      let trashIndexWrites = 0;
      const { storage } = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
          [mapBodyKey("map-2")]: "body-2",
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({ version: 1, items: [existing] }),
          [mapTrashBodyKey("old-t")]: EMPTY_V3,
        },
        failSetItem: (key) => {
          if (key === MAP_INDEX_STORAGE_KEY) return true;
          if (key === MAP_TRASH_INDEX_KEY) {
            trashIndexWrites += 1;
            return trashIndexWrites >= 2;
          }
          return false;
        },
      });

      const result = moveMapToTrash({
        storage,
        index,
        id: "map-2",
        currentMapBackupSnapshot: null,
        now: NOW,
        generateId: idSequence(["unused"]),
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.notice).toEqual(trashMoveRollbackFailedNotice());
        expect(result.nextTrash?.status).toBe("ok");
        if (result.nextTrash?.status === "ok") {
          expect(result.nextTrash.entries.map((item) => item.id)).toEqual(["map-2", "old-t"]);
        }
      }
    });

    it("ゴミ箱インデックスが新規作成で本体なしのとき、アクティブ一覧書込の通常失敗はゴミ箱インデックスを削除して戻す", () => {
      const index = twoMapsIndex();
      const { storage, operations, entries } = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
        },
        failSetItem: (key) => key === MAP_INDEX_STORAGE_KEY,
        failSetItemError: "SecurityError",
      });

      const result = moveMapToTrash({
        storage,
        index,
        id: "map-2",
        currentMapBackupSnapshot: null,
        now: NOW,
        generateId: idSequence(["unused"]),
      });

      expect(result).toEqual({
        ok: false,
        notice: indexWriteFailedNotice("マップを削除"),
        nextTrash: { status: "ok", entries: [] },
      });
      expect(operations.map((op) => [op.type, op.key])).toEqual([
        ["setItem", MAP_TRASH_INDEX_KEY],
        ["setItem", MAP_INDEX_STORAGE_KEY],
        ["removeItem", MAP_TRASH_INDEX_KEY],
      ]);
      expect(entries()[MAP_TRASH_INDEX_KEY]).toBeUndefined();
    });

    it("ゴミ箱破損・本体読取失敗は canPermanentDelete: true を返し、非Quota本体書込失敗や進行中ジャーナルは通常失敗を返す", () => {
      const index = twoMapsIndex();
      const corrupt = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
          [mapBodyKey("map-2")]: "body-2",
          [MAP_TRASH_INDEX_KEY]: "{broken",
        },
      });
      expect(
        moveMapToTrash({
          storage: corrupt.storage,
          index,
          id: "map-2",
          currentMapBackupSnapshot: null,
          now: NOW,
          generateId: idSequence([]),
        }),
      ).toEqual({
        ok: false,
        notice: trashCorruptForMoveNotice(),
        canPermanentDelete: true,
        nextTrash: { status: "corrupt" },
      });
      expect(corrupt.entries()[MAP_TRASH_INDEX_KEY]).toBe("{broken");
      expect(corrupt.entries()[mapBodyKey("map-2")]).toBe("body-2");

      const withBranchJournal = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
          [mapBodyKey("map-2")]: "body-2",
          [BRANCH_MOVE_JOURNAL_KEY]: "{}",
        },
      });
      expect(
        moveMapToTrash({
          storage: withBranchJournal.storage,
          index,
          id: "map-2",
          currentMapBackupSnapshot: null,
          now: NOW,
          generateId: idSequence([]),
        }),
      ).toEqual({
        ok: false,
        notice: indexWriteFailedNotice("マップを削除"),
      });
      expect(withBranchJournal.operations).toEqual([]);

      const withRestoreJournal = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
          [mapBodyKey("map-2")]: "body-2",
          [LIBRARY_RESTORE_JOURNAL_KEY]: "{}",
        },
      });
      expect(
        moveMapToTrash({
          storage: withRestoreJournal.storage,
          index,
          id: "map-2",
          currentMapBackupSnapshot: null,
          now: NOW,
          generateId: idSequence([]),
        }),
      ).toEqual({
        ok: false,
        notice: indexWriteFailedNotice("マップを削除"),
      });
      expect(withRestoreJournal.operations).toEqual([]);

      const readFail = createRecordingStorage({
        initial: { [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index) },
        failGetItem: true,
      });
      // getItem 失敗時は active journal 判定が true になるため通常エラーになる
      expect(
        moveMapToTrash({
          storage: readFail.storage,
          index,
          id: "map-2",
          currentMapBackupSnapshot: null,
          now: NOW,
          generateId: idSequence([]),
        }),
      ).toEqual({
        ok: false,
        notice: indexWriteFailedNotice("マップを削除"),
      });

      const bodyReadFailBase = createRecordingStorage({
        initial: { [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index) },
      });
      const selectiveFailStorage: MapLibraryStorage = {
        get length() {
          return bodyReadFailBase.storage.length;
        },
        key: (i) => bodyReadFailBase.storage.key(i),
        getItem: (key) => {
          if (key === mapBodyKey("map-2")) throw new DOMException("fail", "SecurityError");
          return bodyReadFailBase.storage.getItem(key);
        },
        setItem: (k, v) => bodyReadFailBase.storage.setItem(k, v),
        removeItem: (k) => bodyReadFailBase.storage.removeItem(k),
      };
      expect(
        moveMapToTrash({
          storage: selectiveFailStorage,
          index,
          id: "map-2",
          currentMapBackupSnapshot: null,
          now: NOW,
          generateId: idSequence([]),
        }),
      ).toEqual({
        ok: false,
        notice: trashBodyReadFailedForMoveNotice(),
        canPermanentDelete: true,
        nextTrash: { status: "ok", entries: [] },
      });

      const bodyWriteFail = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
          [mapBodyKey("map-2")]: "body-2",
        },
        failSetItem: (key) => key.startsWith("draw-my-map.trash.v1.doc."),
        failSetItemError: "SecurityError",
      });
      expect(
        moveMapToTrash({
          storage: bodyWriteFail.storage,
          index,
          id: "map-2",
          currentMapBackupSnapshot: null,
          now: NOW,
          generateId: idSequence([]),
        }),
      ).toEqual({
        ok: false,
        notice: trashMoveFailedNotice(),
        nextTrash: { status: "ok", entries: [] },
      });

      const bodyQuotaFail = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
          [mapBodyKey("map-2")]: "body-2",
        },
        failSetItem: (key) => key.startsWith("draw-my-map.trash.v1.doc."),
        failSetItemError: "QuotaExceededError",
      });
      expect(
        moveMapToTrash({
          storage: bodyQuotaFail.storage,
          index,
          id: "map-2",
          currentMapBackupSnapshot: null,
          now: NOW,
          generateId: idSequence([]),
        }),
      ).toEqual({
        ok: false,
        notice: trashQuotaExceededNotice(),
        canPermanentDelete: true,
        nextTrash: { status: "ok", entries: [] },
      });
    });
  });

  describe("permanentlyDeleteActiveMapIndex", () => {
    it("ゴミ箱に触れずアクティブ一覧だけを更新し、最後1件の置換や通知を組み立てる", () => {
      const two = twoMapsIndex();
      const s1 = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(two),
          [MAP_TRASH_INDEX_KEY]: "{corrupt",
        },
      });
      const r1 = permanentlyDeleteActiveMapIndex({
        storage: s1.storage,
        index: two,
        id: "map-2",
        now: NOW,
        generateId: idSequence([]),
      });
      expect(r1.ok).toBe(true);
      if (r1.ok) {
        expect(r1.notices).toEqual({
          removed: mapPermanentlyDeletedNotice("マップ 2"),
          bodyRemains: permanentBodyRemovalFailedNotice("マップ 2"),
        });
        expect(r1.plan.nextIndex.maps.map((m) => m.id)).toEqual(["map-1"]);
      }
      expect(s1.entries()[MAP_TRASH_INDEX_KEY]).toBe("{corrupt");

      const rCurrent = permanentlyDeleteActiveMapIndex({
        storage: createRecordingStorage({ initial: { [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(two) } }).storage,
        index: two,
        id: "map-1",
        now: NOW,
        generateId: idSequence([]),
      });
      expect(rCurrent.ok).toBe(true);
      if (rCurrent.ok) {
        expect(rCurrent.notices).toEqual({
          removed: currentMapPermanentlyDeletedNotice("マップ 1", "マップ 2"),
          bodyRemains: currentPermanentBodyRemovalFailedNotice("マップ 1", "マップ 2"),
        });
      }

      const single = singleMapIndex();
      const sLast = createRecordingStorage({ initial: { [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(single) } });
      const rLast = permanentlyDeleteActiveMapIndex({
        storage: sLast.storage,
        index: single,
        id: "only",
        now: NOW,
        generateId: idSequence(["fresh-1"]),
      });
      expect(rLast.ok).toBe(true);
      if (rLast.ok) {
        expect(rLast.plan.nextIndex.currentMapId).toBe("fresh-1");
        expect(rLast.notices).toEqual({
          removed: lastMapPermanentlyDeletedNotice("唯一"),
          bodyRemains: lastPermanentBodyRemovalFailedNotice("唯一"),
        });
      }
    });

    it("不在ID・ID確保不能・一覧書込失敗・進行中ジャーナル時は安全に失敗する", () => {
      const two = twoMapsIndex();
      expect(
        permanentlyDeleteActiveMapIndex({
          storage: createRecordingStorage({ initial: { [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(two) } }).storage,
          index: two,
          id: "unknown",
          now: NOW,
          generateId: idSequence([]),
        }),
      ).toEqual({ ok: false, notice: indexWriteFailedNotice("マップを削除") });

      const single = singleMapIndex();
      const noId = createRecordingStorage({ initial: { [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(single) } });
      expect(
        permanentlyDeleteActiveMapIndex({
          storage: noId.storage,
          index: single,
          id: "only",
          now: NOW,
          generateId: () => "only",
        }),
      ).toEqual({ ok: false, notice: mapIdUnavailableNotice() });

      const writeFail = createRecordingStorage({
        initial: { [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(two) },
        failSetItem: () => true,
      });
      expect(
        permanentlyDeleteActiveMapIndex({
          storage: writeFail.storage,
          index: two,
          id: "map-2",
          now: NOW,
          generateId: idSequence([]),
        }),
      ).toEqual({ ok: false, notice: indexWriteFailedNotice("マップを削除") });

      const journal = createRecordingStorage({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(two),
          [BRANCH_MOVE_JOURNAL_KEY]: "{}",
        },
      });
      expect(
        permanentlyDeleteActiveMapIndex({
          storage: journal.storage,
          index: two,
          id: "map-2",
          now: NOW,
          generateId: idSequence([]),
        }),
      ).toEqual({ ok: false, notice: indexWriteFailedNotice("マップを削除") });
    });
  });
});
