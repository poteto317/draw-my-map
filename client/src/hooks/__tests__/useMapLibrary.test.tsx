import { StrictMode } from "react";
import { act, renderHook } from "@testing-library/react";
import {
  AUTO_SAVE_FAILURE_MESSAGE,
  bodyRemovalFailedNotice,
  createFlushFailedNotice,
  currentBodyRemovalFailedNotice,
  currentMapDeletedNotice,
  indexWriteFailedNotice,
  lastBodyRemovalFailedNotice,
  lastMapDeletedNotice,
  mapCreatedNotice,
  mapDeletedNotice,
  mapIdUnavailableNotice,
  mapRenamedNotice,
  mapSwitchedNotice,
  switchFlushFailedNotice,
} from "@/domain/mapLibrary/mapLibraryMessages";
import {
  decodeMapIndex,
  encodeMapIndex,
  type MapIndexEntry,
  type MapIndexV1,
} from "@/domain/mapLibrary/mapIndex";
import {
  createEmptyMapLibraryMeta,
  decodeMapLibraryMeta,
  encodeMapLibraryMeta,
  MAX_MAP_FOLDERS,
  type MapLibraryMetaV1,
} from "@/domain/mapLibrary/mapLibraryMeta";
import { parseLibraryBackupJson } from "@/domain/mapLibrary/libraryBackupCodec";
import {
  decodeMapTrashIndex,
  encodeMapTrashIndex,
  type MapTrashEntry,
  type MapTrashIndexV1,
} from "@/domain/mapLibrary/mapTrash";
import {
  mapPermanentlyDeletedNotice,
  currentMapPermanentlyDeletedNotice,
  lastMapPermanentlyDeletedNotice,
  permanentBodyRemovalFailedNotice,
  currentPermanentBodyRemovalFailedNotice,
  lastPermanentBodyRemovalFailedNotice,
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
  trashRestoredCleanupFailedNotice,
  trashRestoredNotice,
  trashRestoreWriteFailedNotice,
} from "@/domain/mapLibrary/mapTrashMessages";
import { useMapLibrary, type MapLibraryDeps } from "@/hooks/useMapLibrary";
import { BRANCH_MOVE_JOURNAL_KEY } from "@/services/persistence/branchMoveJournal";
import {
  MAP_INDEX_STORAGE_KEY,
  mapBodyKey,
} from "@/services/persistence/mapLibraryStorage";
import { MAP_LIBRARY_META_STORAGE_KEY } from "@/services/persistence/mapLibraryMetaStorage";
import {
  MAP_TRASH_INDEX_KEY,
  mapTrashBodyKey,
} from "@/services/persistence/mapTrashStorage";
import { MAP_STORAGE_KEY } from "@/services/persistence/mapStorage";
import { LIBRARY_RESTORE_JOURNAL_KEY } from "@/services/persistence/libraryRestoreJournal";
import { createRecordingStorage } from "@/testing/mapLibraryTestStorage";
import type { MapBackupSnapshot, MapStorageSession } from "@/types/mapStorageSession";

const EMPTY_V3 = '{"version":3,"layoutMode":"manual","nodes":[]}';
const BACKUP_FILE_JSON = JSON.stringify({
  format: "draw-my-map-library-backup", version: 1, exportedAt: "2026-10-21T03:04:05.000Z",
  currentMapId: "source", maps: [{
    id: "source", name: "移行元", createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z", document: JSON.parse(EMPTY_V3),
  }],
});

function backupFile(text: () => Promise<string> = async () => BACKUP_FILE_JSON): File {
  const file = new File([BACKUP_FILE_JSON], "backup.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: text });
  return file;
}

// Fast Refresh は state と ref を保ったまま、依存配列に関係なくすべての effect を再実行する。
// その再実行を再現するため、フラグを立てた後の1回の描画で呼ばれた依存配列付きの useEffect を、
// 並び順に関係なくすべて依存を異なる値に差し替えて再実行させる。フラグは差し替えた effect が
// 最初に実行されたとき（その描画の useEffect の呼び出しがすべて終わった後）に下ろすので、
// effect の setState で描画が続いても差し替えは1回の描画に限られる。
// 起動の effect がその描画の useEffect に含まれる限り、hook に effect を足しても再実行の対象から外れない
let mockForceEffectRerun = false;
const mockForcedEffects = { declared: 0, executed: 0 };
jest.mock("react", () => {
  const actual = jest.requireActual<typeof import("react")>("react");
  return {
    ...actual,
    useEffect: (effect: React.EffectCallback, deps?: React.DependencyList) => {
      if (!mockForceEffectRerun || deps === undefined) return actual.useEffect(effect, deps);
      mockForcedEffects.declared += 1;
      return actual.useEffect(() => {
        mockForceEffectRerun = false;
        mockForcedEffects.executed += 1;
        return effect();
      }, deps.map(() => ({})));
    },
  };
});

const NOW = "2026-10-21T03:04:05.000Z";
const SEED_TIMESTAMP = "2026-01-01T00:00:00.000Z";
const LEGACY_JSON = `{
  "version": 2,
  "layoutMode": "manual",
  "nodes": []
}\n`;

function entry(id: string, name: string): MapIndexEntry {
  return { id, name, createdAt: SEED_TIMESTAMP, updatedAt: SEED_TIMESTAMP };
}

// map-1（本体あり・開いている）と map-2（本体あり）の2件
function twoMapsInitial(extra: Record<string, string> = {}): Record<string, string> {
  const index: MapIndexV1 = {
    version: 1,
    currentMapId: "map-1",
    maps: [entry("map-1", "マップ 1"), entry("map-2", "マップ 2")],
    legacyCleanupPending: false,
  };
  return {
    [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
    [mapBodyKey("map-1")]: "body-1",
    [mapBodyKey("map-2")]: "body-2",
    ...extra,
  };
}

// A（開いている）、B（12:00 更新）、C（11:00 更新）の3件。次に開くマップの取り違えを
// 検出できるよう、配列では C を B より前に置く（L-170）
function threeMapsInitial(extra: Record<string, string> = {}): Record<string, string> {
  const index: MapIndexV1 = {
    version: 1,
    currentMapId: "map-a",
    maps: [
      entry("map-a", "A"),
      { ...entry("map-c", "C"), updatedAt: "2026-10-20T11:00:00.000Z" },
      { ...entry("map-b", "B"), updatedAt: "2026-10-20T12:00:00.000Z" },
    ],
    legacyCleanupPending: false,
  };
  return {
    [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
    [mapBodyKey("map-a")]: "body-a",
    [mapBodyKey("map-b")]: "body-b",
    [mapBodyKey("map-c")]: "body-c",
    ...extra,
  };
}

// 1件だけ（本体あり・開いている）
function singleMapInitial(extra: Record<string, string> = {}): Record<string, string> {
  const index: MapIndexV1 = {
    version: 1,
    currentMapId: "only",
    maps: [entry("only", "唯一")],
    legacyCleanupPending: false,
  };
  return {
    [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
    [mapBodyKey("only")]: "body-only",
    ...extra,
  };
}

function idSequence(ids: readonly string[]): () => string {
  let next = 0;
  return () => {
    const id = ids[next] ?? `generated-${next}`;
    next += 1;
    return id;
  };
}

function setup(
  options: {
    initial?: Record<string, string>;
    ids?: readonly string[];
    strict?: boolean;
    failRemoveItem?: (key: string) => boolean;
    beforeRemoveItem?: (key: string) => void;
    onGenerateId?: () => void;
    failSetItem?: (key: string, value: string) => boolean;
    failSetItemError?: string;
    now?: () => Date;
    // 真を返すキーの getItem は SecurityError を投げる（読めないストレージの再現）
    throwOnGetItem?: (key: string) => boolean;
  } = {},
) {
  let failIndexWrite = false;
  const recording = createRecordingStorage({
    initial: options.initial,
    failSetItem: (key, value) =>
      (failIndexWrite && key === MAP_INDEX_STORAGE_KEY) ||
      Boolean(options.failSetItem?.(key, value)),
    failSetItemError: options.failSetItemError,
    failRemoveItem: options.failRemoveItem,
    beforeRemoveItem: options.beforeRemoveItem,
  });
  if (options.throwOnGetItem !== undefined) {
    const throwOnGetItem = options.throwOnGetItem;
    const originalGetItem = recording.storage.getItem.bind(recording.storage);
    recording.storage.getItem = (key: string) => {
      if (throwOnGetItem(key)) throw new DOMException("blocked", "SecurityError");
      return originalGetItem(key);
    };
  }
  const generateId = idSequence(options.ids ?? []);
  const deps: MapLibraryDeps = {
    getStorage: () => recording.storage,
    now: () => options.now?.() ?? new Date(NOW),
    generateId: () => {
      options.onGenerateId?.();
      return generateId();
    },
  };
  const rendered = renderHook(() => useMapLibrary(deps), {
    wrapper: options.strict ? StrictMode : undefined,
  });
  return {
    ...recording,
    ...rendered,
    setFailIndexWrite: (fail: boolean) => {
      failIndexWrite = fail;
    },
  };
}

function readyView(view: ReturnType<typeof useMapLibrary>["view"]) {
  if (view.status !== "ready") {
    throw new Error("view が ready ではありません。");
  }
  return view;
}

function storedIndex(entries: Record<string, string>): MapIndexV1 {
  const decoded = decodeMapIndex(entries[MAP_INDEX_STORAGE_KEY]);
  if (decoded.kind !== "ok") {
    throw new Error("インデックスを読めません。");
  }
  return decoded.index;
}

function storedTrashIndex(entries: Record<string, string>): MapTrashIndexV1 {
  const decoded = decodeMapTrashIndex(entries[MAP_TRASH_INDEX_KEY]);
  if (decoded.kind !== "ok") {
    throw new Error("ゴミ箱インデックスを読めません。");
  }
  return decoded.index;
}

function storedLibraryMeta(entries: Record<string, string>): MapLibraryMetaV1 {
  const decoded = decodeMapLibraryMeta(entries[MAP_LIBRARY_META_STORAGE_KEY] ?? null);
  if (!decoded.ok) {
    throw new Error("ライブラリメタデータを読めません。");
  }
  return decoded.meta;
}

function trashEntry(overrides: Partial<MapTrashEntry> = {}): MapTrashEntry {
  return {
    id: "trash-1",
    originalMapId: "trash-1",
    name: "削除済みマップ",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
    deletedAt: "2026-10-10T00:00:00.000Z",
    expiresAt: "2026-11-09T00:00:00.000Z",
    hasBody: true,
    ...overrides,
  };
}

describe("useMapLibrary", () => {
  describe("起動", () => {
    it("effect の後に ready になり、インデックスの無い Storage ではインデックスを1回だけ書く", () => {
      const { result, operations } = setup({ ids: ["first"] });

      const view = readyView(result.current.view);
      expect(view.storageMode).toBe("persistent");
      expect(view.currentMap).toEqual({
        id: "first",
        name: "無題のマップ",
        createdAt: NOW,
        updatedAt: NOW,
      });
      expect(view.maps).toEqual([view.currentMap]);
      expect(view.storageSession.mapId).toBe("first");
      expect(view.startupNotice).toBeNull();
      expect(operations).toEqual([
        { type: "setItem", key: MAP_INDEX_STORAGE_KEY, value: expect.any(String) },
        { type: "setItem", key: MAP_LIBRARY_META_STORAGE_KEY, value: expect.any(String) },
      ]);
    });

    it("StrictMode でも旧キーの移行は1回だけで、同じ起動では旧キーを消さない", () => {
      const { result, operations } = setup({
        initial: { [MAP_STORAGE_KEY]: LEGACY_JSON },
        ids: ["migrated"],
        strict: true,
      });

      expect(operations.map((operation) => [operation.type, operation.key])).toEqual([
        ["setItem", mapBodyKey("migrated")],
        ["setItem", MAP_INDEX_STORAGE_KEY],
        ["setItem", MAP_LIBRARY_META_STORAGE_KEY],
      ]);
      expect(operations.some((operation) => operation.type === "removeItem")).toBe(false);
      expect(readyView(result.current.view).startupNotice).toBeNull();
    });

    it("StrictMode でも壊れたインデックスの warning の通知が残る", () => {
      const { result } = setup({
        initial: { [MAP_INDEX_STORAGE_KEY]: "{" },
        ids: ["rebuilt"],
        strict: true,
      });

      expect(readyView(result.current.view).startupNotice).toEqual({
        kind: "warning",
        message: "マップの一覧を読み取れなかったため、空のマップで開始します。",
      });
    });

    it("起動の後に effect が再実行されても（Fast Refresh）、起動後の操作で進んだ状態を巻き戻さない", () => {
      const { result, rerender, entries } = setup({
        initial: twoMapsInitial(),
        ids: ["new-1"],
      });
      act(() => {
        result.current.createMap("新しい地図");
      });
      const sessionAfterCreate = readyView(result.current.view).storageSession;

      mockForcedEffects.declared = 0;
      mockForcedEffects.executed = 0;
      mockForceEffectRerun = true;
      rerender();
      // その描画の依存配列付きの useEffect（起動の effect を含む）がすべて再実行された
      expect(mockForceEffectRerun).toBe(false);
      expect(mockForcedEffects.declared).toBeGreaterThanOrEqual(1);
      expect(mockForcedEffects.executed).toBe(mockForcedEffects.declared);

      const view = readyView(result.current.view);
      expect(view.currentMap.id).toBe("new-1");
      expect(view.maps.map((map) => map.id)).toContain("new-1");
      expect(view.storageSession).toBe(sessionAfterCreate);
      // 作成後のセッションの本体の保存が有効のままで、一覧から作成したマップが消えない
      let written: ReturnType<MapStorageSession["writeBody"]> | undefined;
      act(() => {
        written = view.storageSession.writeBody("body-new");
      });
      expect(written).toEqual({ status: "saved" });
      expect(storedIndex(entries()).maps.map((map) => map.id)).toEqual([
        "map-1",
        "map-2",
        "new-1",
      ]);
    });

    it("再描画しても同じセッションのオブジェクトを返す", () => {
      const { result, rerender } = setup({ initial: twoMapsInitial() });
      const session = readyView(result.current.view).storageSession;

      rerender();

      expect(readyView(result.current.view).storageSession).toBe(session);
    });

    it("表示順（更新日時の新しい順）で maps を返す", () => {
      const index: MapIndexV1 = {
        version: 1,
        currentMapId: "old",
        maps: [
          entry("old", "古い"),
          { ...entry("new", "新しい"), updatedAt: "2026-05-01T00:00:00.000Z" },
        ],
        legacyCleanupPending: false,
      };
      const { result } = setup({
        initial: { [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index) },
      });

      expect(readyView(result.current.view).maps.map((map) => map.id)).toEqual([
        "new",
        "old",
      ]);
    });

    it("起動時にゴミ箱の期限切れ項目が自動清掃され、有効項目だけが trashEntries に入る", () => {
      const expired = trashEntry({
        id: "expired-1",
        expiresAt: "2026-10-20T00:00:00.000Z",
      });
      const valid = trashEntry({
        id: "valid-1",
        deletedAt: "2026-10-11T00:00:00.000Z",
        expiresAt: "2026-11-10T00:00:00.000Z",
      });
      const { result, entries } = setup({
        initial: {
          ...twoMapsInitial(),
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({ version: 1, items: [expired, valid] }),
          [mapTrashBodyKey("expired-1")]: EMPTY_V3,
          [mapTrashBodyKey("valid-1")]: EMPTY_V3,
        },
      });

      const view = readyView(result.current.view);
      expect(view.storageMode).toBe("persistent");
      expect(view.trashStatus).toBe("ok");
      expect(view.trashEntries).toEqual([valid]);
      expect(entries()[mapTrashBodyKey("expired-1")]).toBeUndefined();
      expect(entries()[mapTrashBodyKey("valid-1")]).toBe(EMPTY_V3);
    });

    it("起動時にゴミ箱インデックスが破損していても通常モードを維持し、trashStatus を corrupt にする", () => {
      const { result } = setup({
        initial: {
          ...twoMapsInitial(),
          [MAP_TRASH_INDEX_KEY]: "{corrupt",
        },
      });

      const view = readyView(result.current.view);
      expect(view.storageMode).toBe("persistent");
      expect(view.trashStatus).toBe("corrupt");
      expect(view.trashEntries).toEqual([]);
      expect(view.startupNotice).toBeNull();
    });
  });

  describe("作成", () => {
    it("インデックスだけを書き、新しいマップを開く", () => {
      const { result, operations, entries } = setup({
        initial: twoMapsInitial(),
        ids: ["new-1"],
      });
      const before = operations.length;

      let created: ReturnType<typeof result.current.createMap> | undefined;
      act(() => {
        created = result.current.createMap("  新しい地図  ");
      });

      expect(created).toEqual({
        ok: true,
        remounted: true,
        notice: mapCreatedNotice("新しい地図"),
        saveRetryNotice: null,
      });
      expect(operations.slice(before).map((operation) => operation.key)).toEqual([
        MAP_INDEX_STORAGE_KEY,
        MAP_LIBRARY_META_STORAGE_KEY,
      ]);
      const view = readyView(result.current.view);
      expect(view.currentMap).toEqual({
        id: "new-1",
        name: "新しい地図",
        createdAt: NOW,
        updatedAt: NOW,
      });
      expect(view.storageSession.mapId).toBe("new-1");
      expect(storedIndex(entries()).currentMapId).toBe("new-1");
      expect(storedIndex(entries()).maps.map((map) => map.id)).toEqual([
        "map-1",
        "map-2",
        "new-1",
      ]);
    });

    it("flush で保存した後のインデックスを基準にし、元のマップの更新日時を巻き戻さない", () => {
      const { result, operations, entries } = setup({
        initial: twoMapsInitial(),
        ids: ["new-1"],
      });
      const session = readyView(result.current.view).storageSession;
      session.registerFlush(() => {
        const written = session.writeBody("edited-1");
        return written.status === "saved"
          ? { status: "saved" }
          : { status: "failed", error: "保存できない" };
      });
      const before = operations.length;

      act(() => {
        result.current.createMap("新しい地図");
      });

      expect(operations.slice(before).map((operation) => operation.key)).toEqual([
        mapBodyKey("map-1"),
        MAP_INDEX_STORAGE_KEY,
        MAP_INDEX_STORAGE_KEY,
        MAP_LIBRARY_META_STORAGE_KEY,
      ]);
      expect(entries()[mapBodyKey("map-1")]).toBe("edited-1");
      const index = storedIndex(entries());
      expect(index.currentMapId).toBe("new-1");
      expect(index.maps.find((map) => map.id === "map-1")?.updatedAt).toBe(NOW);
      const view = readyView(result.current.view);
      expect(view.currentMap.id).toBe("new-1");
      expect(view.maps.find((map) => map.id === "map-1")?.updatedAt).toBe(NOW);
    });

    it("flush が failed なら中止し、インデックスを書かない", () => {
      const { result, operations } = setup({
        initial: twoMapsInitial(),
        ids: ["new-1"],
      });
      const session = readyView(result.current.view).storageSession;
      session.registerFlush(() => ({ status: "failed", error: "保存できない" }));
      const before = operations.length;

      let created: ReturnType<typeof result.current.createMap> | undefined;
      act(() => {
        created = result.current.createMap("新しい地図");
      });

      expect(created).toEqual({ ok: false, notice: createFlushFailedNotice() });
      expect(operations.slice(before)).toEqual([]);
      expect(readyView(result.current.view).currentMap.id).toBe("map-1");
    });

    it("インデックスの書き込みに失敗したら view を変えない", () => {
      const { result, setFailIndexWrite } = setup({
        initial: twoMapsInitial(),
        ids: ["new-1"],
      });
      const viewBefore = result.current.view;
      setFailIndexWrite(true);

      let created: ReturnType<typeof result.current.createMap> | undefined;
      act(() => {
        created = result.current.createMap("新しい地図");
      });

      expect(created).toEqual({
        ok: false,
        notice: indexWriteFailedNotice("マップを作成"),
      });
      expect(result.current.view).toBe(viewBefore);
    });

    it("孤立した本体と同じ id が生成されたら作り直す", () => {
      const { result } = setup({
        initial: twoMapsInitial({ [mapBodyKey("orphan")]: "old-body" }),
        ids: ["orphan", "map-2", "new-2"],
      });

      act(() => {
        result.current.createMap("新しい地図");
      });

      expect(readyView(result.current.view).currentMap.id).toBe("new-2");
    });

    it("使える id を作れなければ ok: false で何も書かない", () => {
      const { result, operations } = setup({
        initial: twoMapsInitial(),
        ids: Array.from({ length: 10 }, () => "map-2"),
      });
      const viewBefore = result.current.view;
      const before = operations.length;

      let created: ReturnType<typeof result.current.createMap> | undefined;
      act(() => {
        created = result.current.createMap("新しい地図");
      });

      expect(created).toEqual({ ok: false, notice: mapIdUnavailableNotice() });
      expect(operations.slice(before)).toEqual([]);
      expect(result.current.view).toBe(viewBefore);
    });

    it("名前が51文字なら ok: false で何も書かない", () => {
      const { result, operations } = setup({
        initial: twoMapsInitial(),
        ids: ["new-1"],
      });
      const before = operations.length;

      let created: ReturnType<typeof result.current.createMap> | undefined;
      act(() => {
        created = result.current.createMap("あ".repeat(51));
      });

      expect(created).toEqual({
        ok: false,
        notice: {
          kind: "error",
          message: "マップ名は50文字以内で入力してください。（現在 51 文字）",
        },
      });
      expect(operations.slice(before)).toEqual([]);
    });
  });

  describe("切り替え", () => {
    it("flush → インデックスの順に書き、切り替え先を開く", () => {
      const { result, operations, entries } = setup({ initial: twoMapsInitial() });
      const session = readyView(result.current.view).storageSession;
      session.registerFlush(() => {
        const written = session.writeBody("edited-1");
        return written.status === "saved"
          ? { status: "saved" }
          : { status: "failed", error: "保存できない" };
      });
      const before = operations.length;

      let switched: ReturnType<typeof result.current.switchMap> | undefined;
      act(() => {
        switched = result.current.switchMap("map-2");
      });

      expect(switched).toEqual({
        ok: true,
        remounted: true,
        notice: mapSwitchedNotice("マップ 2"),
        saveRetryNotice: null,
        sessionNumber: 1,
      });
      expect(operations.slice(before).map((operation) => operation.key)).toEqual([
        mapBodyKey("map-1"),
        MAP_INDEX_STORAGE_KEY,
        MAP_INDEX_STORAGE_KEY,
        MAP_LIBRARY_META_STORAGE_KEY,
      ]);
      expect(entries()[mapBodyKey("map-1")]).toBe("edited-1");
      expect(storedIndex(entries()).currentMapId).toBe("map-2");
      // flush で進めた map-1 の更新日時を、切り替えのインデックスで巻き戻さない
      expect(
        storedIndex(entries()).maps.find((map) => map.id === "map-1")?.updatedAt,
      ).toBe(NOW);
      const view = readyView(result.current.view);
      expect(view.currentMap.id).toBe("map-2");
      expect(view.storageSession.mapId).toBe("map-2");
      expect(view.maps.find((map) => map.id === "map-1")?.updatedAt).toBe(NOW);
    });

    it("現在のマップを選ぶと何も書かない", () => {
      const { result, operations } = setup({ initial: twoMapsInitial() });
      const before = operations.length;

      let switched: ReturnType<typeof result.current.switchMap> | undefined;
      act(() => {
        switched = result.current.switchMap("map-1");
      });

      expect(switched).toEqual({
        ok: true,
        remounted: false,
        notice: null,
        saveRetryNotice: null,
      });
      expect(operations.slice(before)).toEqual([]);
    });

    it("存在しない id なら ok: false で、flush もせず何も書かない", () => {
      const { result, operations } = setup({ initial: twoMapsInitial() });
      const flush = jest.fn(() => ({ status: "saved" as const }));
      readyView(result.current.view).storageSession.registerFlush(flush);
      const viewBefore = result.current.view;
      const before = operations.length;

      let switched: ReturnType<typeof result.current.switchMap> | undefined;
      act(() => {
        switched = result.current.switchMap("missing");
      });

      expect(switched).toEqual({
        ok: false,
        notice: indexWriteFailedNotice("マップを切り替え"),
      });
      expect(flush).not.toHaveBeenCalled();
      expect(operations.slice(before)).toEqual([]);
      expect(result.current.view).toBe(viewBefore);
    });

    it("インデックスの書き込みに失敗したら、切り替えずに元のセッションのまま", () => {
      const { result, setFailIndexWrite } = setup({ initial: twoMapsInitial() });
      const viewBefore = result.current.view;
      setFailIndexWrite(true);

      let switched: ReturnType<typeof result.current.switchMap> | undefined;
      act(() => {
        switched = result.current.switchMap("map-2");
      });

      expect(switched).toEqual({
        ok: false,
        notice: indexWriteFailedNotice("マップを切り替え"),
      });
      expect(result.current.view).toBe(viewBefore);
      setFailIndexWrite(false);
      let written: ReturnType<MapStorageSession["writeBody"]> | undefined;
      act(() => {
        written = readyView(result.current.view).storageSession.writeBody("edited-1");
      });
      expect(written).toEqual({ status: "saved" });
      expect(readyView(result.current.view).currentMap.id).toBe("map-1");
    });

    it("A → B → A の後、最初の A のセッションの writeBody は inactive で何も書かない", () => {
      const { result, operations, entries } = setup({ initial: twoMapsInitial() });
      const firstA = readyView(result.current.view).storageSession;

      act(() => {
        result.current.switchMap("map-2");
      });
      act(() => {
        result.current.switchMap("map-1");
      });
      const secondA = readyView(result.current.view).storageSession;
      expect(secondA.mapId).toBe("map-1");
      expect(secondA).not.toBe(firstA);
      const before = operations.length;

      expect(firstA.writeBody("x")).toEqual({ status: "inactive" });
      expect(operations.slice(before)).toEqual([]);
      expect(entries()[mapBodyKey("map-1")]).toBe("body-1");

      let written: ReturnType<MapStorageSession["writeBody"]> | undefined;
      act(() => {
        written = secondA.writeBody("y");
      });
      expect(written).toEqual({ status: "saved" });
      expect(entries()[mapBodyKey("map-1")]).toBe("y");
    });

    it("同じ act の中で切り替えの後にインデックスだけを更新しても、旧セッションの writeBody は inactive のまま", () => {
      const { result, operations, entries } = setup({ initial: twoMapsInitial() });
      const firstA = readyView(result.current.view).storageSession;
      let stale: ReturnType<MapStorageSession["writeBody"]> | undefined;

      act(() => {
        result.current.switchMap("map-2");
        // 切り替え直後のコミット前に、セッションを変えない更新（名前変更）を挟む
        result.current.renameMap("map-2", "改名");
        stale = firstA.writeBody("x");
      });

      expect(stale).toEqual({ status: "inactive" });
      expect(entries()[mapBodyKey("map-1")]).toBe("body-1");
      const before = operations.length;
      act(() => {
        stale = firstA.writeBody("y");
      });
      expect(stale).toEqual({ status: "inactive" });
      expect(operations.slice(before)).toEqual([]);
    });

    it("前のセッションで登録した flush は、切り替えの後に呼ばない", () => {
      const { result, operations } = setup({ initial: twoMapsInitial() });
      const firstA = readyView(result.current.view).storageSession;
      const staleFlush = jest.fn(() => ({ status: "failed" as const, error: "古い" }));

      act(() => {
        result.current.switchMap("map-2");
      });
      firstA.registerFlush(staleFlush);
      const before = operations.length;

      let switched: ReturnType<typeof result.current.switchMap> | undefined;
      act(() => {
        switched = result.current.switchMap("map-1");
      });

      expect(staleFlush).not.toHaveBeenCalled();
      expect(switched).toMatchObject({ ok: true, remounted: true });
      expect(operations.slice(before).map((operation) => operation.key)).toEqual([
        MAP_INDEX_STORAGE_KEY,
        MAP_LIBRARY_META_STORAGE_KEY,
      ]);
    });
  });

  describe("flush の登録", () => {
    it("古いセッションが後から登録しても、現在の登録が残って切り替えの前に呼ばれる", () => {
      const { result, operations } = setup({ initial: twoMapsInitial() });
      const firstA = readyView(result.current.view).storageSession;
      act(() => {
        result.current.switchMap("map-2");
      });
      const currentFlush = jest.fn(() => ({ status: "failed" as const, error: "保存できない" }));
      readyView(result.current.view).storageSession.registerFlush(currentFlush);
      const staleFlush = jest.fn(() => ({ status: "saved" as const }));
      const unregisterStale = firstA.registerFlush(staleFlush);
      const before = operations.length;

      let switched: ReturnType<typeof result.current.switchMap> | undefined;
      act(() => {
        switched = result.current.switchMap("map-1");
      });

      expect(currentFlush).toHaveBeenCalledTimes(1);
      expect(staleFlush).not.toHaveBeenCalled();
      expect(switched).toEqual({ ok: false, notice: switchFlushFailedNotice() });
      expect(operations.slice(before)).toEqual([]);
      expect(readyView(result.current.view).currentMap.id).toBe("map-2");

      // 古い登録の解除関数は、現在の登録を消さない
      unregisterStale();
      act(() => {
        result.current.switchMap("map-1");
      });
      expect(currentFlush).toHaveBeenCalledTimes(2);
    });

    it("現在の登録の解除関数を呼ぶと、次の切り替えでは flush を呼ばない", () => {
      const { result } = setup({ initial: twoMapsInitial() });
      const flush = jest.fn(() => ({ status: "failed" as const, error: "保存できない" }));
      const unregister = readyView(result.current.view).storageSession.registerFlush(flush);

      unregister();
      let switched: ReturnType<typeof result.current.switchMap> | undefined;
      act(() => {
        switched = result.current.switchMap("map-2");
      });

      expect(flush).not.toHaveBeenCalled();
      expect(switched).toMatchObject({ ok: true, remounted: true });
    });
  });

  describe("本体の書き込み", () => {
    it("成功すると、そのマップの updatedAt だけを now にする", () => {
      const { result, entries } = setup({ initial: twoMapsInitial() });
      const session = readyView(result.current.view).storageSession;

      let written: ReturnType<MapStorageSession["writeBody"]> | undefined;
      act(() => {
        written = session.writeBody("edited-1");
      });

      expect(written).toEqual({ status: "saved" });
      expect(entries()[mapBodyKey("map-1")]).toBe("edited-1");
      expect(storedIndex(entries()).maps).toEqual([
        { ...entry("map-1", "マップ 1"), updatedAt: NOW },
        entry("map-2", "マップ 2"),
      ]);
      expect(readyView(result.current.view).currentMap.updatedAt).toBe(NOW);
    });

    it("名前変更と切り替えでは updatedAt を変えない", () => {
      const { result, entries } = setup({ initial: twoMapsInitial() });

      act(() => {
        result.current.renameMap("map-2", "別名");
      });
      act(() => {
        result.current.switchMap("map-2");
      });

      expect(storedIndex(entries()).maps).toEqual([
        entry("map-1", "マップ 1"),
        entry("map-2", "別名"),
      ]);
    });

    it("インデックスの書き込みに失敗しても saved を返す", () => {
      const { result, entries, setFailIndexWrite } = setup({
        initial: twoMapsInitial(),
      });
      const session = readyView(result.current.view).storageSession;
      setFailIndexWrite(true);

      let written: ReturnType<MapStorageSession["writeBody"]> | undefined;
      act(() => {
        written = session.writeBody("edited-1");
      });

      expect(written).toEqual({ status: "saved" });
      expect(entries()[mapBodyKey("map-1")]).toBe("edited-1");
      expect(storedIndex(entries()).maps[0].updatedAt).toBe(SEED_TIMESTAMP);
    });

    it("readBody はそのマップの本体を返す", () => {
      const { result } = setup({ initial: twoMapsInitial() });

      expect(readyView(result.current.view).storageSession.readBody()).toEqual({
        ok: true,
        value: "body-1",
      });
    });

    it("同じ act の中で writeBody と renameMap を続けて呼ぶと、両方の変更が残る", () => {
      const { result, entries } = setup({ initial: twoMapsInitial() });
      const session = readyView(result.current.view).storageSession;

      act(() => {
        session.writeBody("edited-1");
        result.current.renameMap("map-1", "新しい名前");
      });

      const expected = {
        ...entry("map-1", "新しい名前"),
        updatedAt: NOW,
      };
      expect(storedIndex(entries()).maps[0]).toEqual(expected);
      expect(readyView(result.current.view).currentMap).toEqual(expected);
    });
  });

  describe("名前変更", () => {
    it("インデックスだけを書き、名前を変える", () => {
      const { result, operations } = setup({ initial: twoMapsInitial() });
      const sessionBefore = readyView(result.current.view).storageSession;
      const before = operations.length;

      let renamed: ReturnType<typeof result.current.renameMap> | undefined;
      act(() => {
        renamed = result.current.renameMap("map-1", "新しい名前");
      });

      expect(renamed).toEqual({
        ok: true,
        remounted: false,
        notice: mapRenamedNotice("新しい名前"),
        saveRetryNotice: null,
      });
      expect(operations.slice(before).map((operation) => operation.key)).toEqual([
        MAP_INDEX_STORAGE_KEY,
      ]);
      const view = readyView(result.current.view);
      expect(view.currentMap.name).toBe("新しい名前");
      expect(view.storageSession).toBe(sessionBefore);
    });

    it("前後の空白だけが違う同じ名前なら何も書かない", () => {
      const { result, operations } = setup({ initial: twoMapsInitial() });
      const before = operations.length;

      let renamed: ReturnType<typeof result.current.renameMap> | undefined;
      act(() => {
        renamed = result.current.renameMap("map-1", "  マップ 1 ");
      });

      expect(renamed).toEqual({
        ok: true,
        remounted: false,
        notice: null,
        saveRetryNotice: null,
      });
      expect(operations.slice(before)).toEqual([]);
    });

    it("51文字なら ok: false で何も書かない", () => {
      const { result, operations } = setup({ initial: twoMapsInitial() });
      const before = operations.length;

      let renamed: ReturnType<typeof result.current.renameMap> | undefined;
      act(() => {
        renamed = result.current.renameMap("map-1", "あ".repeat(51));
      });

      expect(renamed).toEqual({
        ok: false,
        notice: {
          kind: "error",
          message: "マップ名は50文字以内で入力してください。（現在 51 文字）",
        },
      });
      expect(operations.slice(before)).toEqual([]);
    });

    it("インデックスの書き込みに失敗したら名前を変えない", () => {
      const { result, setFailIndexWrite } = setup({ initial: twoMapsInitial() });
      const viewBefore = result.current.view;
      setFailIndexWrite(true);

      let renamed: ReturnType<typeof result.current.renameMap> | undefined;
      act(() => {
        renamed = result.current.renameMap("map-1", "新しい名前");
      });

      expect(renamed).toEqual({
        ok: false,
        notice: indexWriteFailedNotice("名前を変更"),
      });
      expect(result.current.view).toBe(viewBefore);
    });

    it("存在しない id なら ok: false で何も書かない", () => {
      const { result, operations } = setup({ initial: twoMapsInitial() });
      const viewBefore = result.current.view;
      const before = operations.length;

      let renamed: ReturnType<typeof result.current.renameMap> | undefined;
      act(() => {
        renamed = result.current.renameMap("missing", "新しい名前");
      });

      expect(renamed).toEqual({
        ok: false,
        notice: indexWriteFailedNotice("名前を変更"),
      });
      expect(operations.slice(before)).toEqual([]);
      expect(result.current.view).toBe(viewBefore);
    });
  });

  describe("削除", () => {
    describe("開いていない別のマップ", () => {
      it("ゴミ箱へ保存 → アクティブ一覧 → 旧本体の順に更新し、現在のマップは開いたまま", () => {
        const { result, operations, entries } = setup({ initial: threeMapsInitial() });
        const sessionBefore = readyView(result.current.view).storageSession;
        const before = operations.length;

        let deleted: ReturnType<typeof result.current.deleteMap> | undefined;
        act(() => {
          deleted = result.current.deleteMap("map-b");
        });

        expect(deleted).toEqual({
          ok: true,
          remounted: false,
          notice: mapDeletedNotice("B"),
          saveRetryNotice: null,
        });
        expect(
          operations.slice(before).map((operation) => [operation.type, operation.key]),
        ).toEqual([
          ["setItem", mapTrashBodyKey("map-b")],
          ["setItem", MAP_TRASH_INDEX_KEY],
          ["setItem", MAP_INDEX_STORAGE_KEY],
          ["removeItem", mapBodyKey("map-b")],
        ]);
        expect(entries()[mapBodyKey("map-b")]).toBeUndefined();
        expect(entries()[mapTrashBodyKey("map-b")]).toBe("body-b");
        expect(storedTrashIndex(entries()).items).toEqual([
          {
            id: "map-b",
            originalMapId: "map-b",
            name: "B",
            createdAt: SEED_TIMESTAMP,
            updatedAt: "2026-10-20T12:00:00.000Z",
            deletedAt: NOW,
            expiresAt: "2026-11-20T03:04:05.000Z",
            hasBody: true,
          },
        ]);
        expect(storedIndex(entries()).currentMapId).toBe("map-a");
        expect(storedIndex(entries()).maps.map((map) => map.id)).toEqual([
          "map-a",
          "map-c",
        ]);
        const view = readyView(result.current.view);
        expect(view.currentMap.id).toBe("map-a");
        expect(view.maps.map((map) => map.id)).toEqual(["map-c", "map-a"]);
        expect(view.trashStatus).toBe("ok");
        expect(view.trashEntries).toEqual(storedTrashIndex(entries()).items);
        expect(view.storageSession).toBe(sessionBefore);
      });

      it("本体の削除に失敗したら、一覧とゴミ箱は更新され、本体は残り、warning だけを返す", () => {
        const { result, entries } = setup({
          initial: threeMapsInitial(),
          failRemoveItem: (key) => key === mapBodyKey("map-b"),
        });

        let deleted: ReturnType<typeof result.current.deleteMap> | undefined;
        act(() => {
          deleted = result.current.deleteMap("map-b");
        });

        expect(deleted).toEqual({
          ok: true,
          remounted: false,
          notice: bodyRemovalFailedNotice("B"),
          saveRetryNotice: null,
        });
        expect(entries()[mapBodyKey("map-b")]).toBe("body-b");
        expect(entries()[mapTrashBodyKey("map-b")]).toBe("body-b");
        expect(storedIndex(entries()).maps.map((map) => map.id)).toEqual([
          "map-a",
          "map-c",
        ]);
        expect(readyView(result.current.view).maps.map((map) => map.id)).toEqual([
          "map-c",
          "map-a",
        ]);
        expect(readyView(result.current.view).trashEntries.map((item) => item.id)).toEqual([
          "map-b",
        ]);
      });

      it("インデックスの書き込みが QuotaExceededError で失敗したらゴミ箱を逆順ロールバックし、canPermanentDelete: true を返す", () => {
        const { result, operations, entries, setFailIndexWrite } = setup({
          initial: threeMapsInitial(),
        });
        const viewBefore = result.current.view;
        const flush = jest.fn(() => ({ status: "saved" as const }));
        readyView(viewBefore).storageSession.registerFlush(flush);
        setFailIndexWrite(true);
        const before = operations.length;

        let deleted: ReturnType<typeof result.current.deleteMap> | undefined;
        act(() => {
          deleted = result.current.deleteMap("map-b");
        });

        expect(deleted).toEqual({
          ok: false,
          notice: indexWriteFailedNotice("マップを削除"),
          canPermanentDelete: true,
        });
        expect(
          operations.slice(before).map((operation) => [operation.type, operation.key]),
        ).toEqual([
          ["setItem", mapTrashBodyKey("map-b")],
          ["setItem", MAP_TRASH_INDEX_KEY],
          ["setItem", MAP_INDEX_STORAGE_KEY],
          ["removeItem", mapTrashBodyKey("map-b")],
          ["removeItem", MAP_TRASH_INDEX_KEY],
        ]);
        expect(entries()[mapBodyKey("map-b")]).toBe("body-b");
        expect(entries()[mapTrashBodyKey("map-b")]).toBeUndefined();
        expect(entries()[MAP_TRASH_INDEX_KEY]).toBeUndefined();
        expect(flush).not.toHaveBeenCalled();
        expect(result.current.view).toBe(viewBefore);
      });

      it("インデックスの書き込みが非 QuotaExceededError で失敗したらゴミ箱を戻し、canPermanentDelete は付けない", () => {
        const { result, entries } = setup({
          initial: threeMapsInitial(),
          failSetItem: (key) => key === MAP_INDEX_STORAGE_KEY,
          failSetItemError: "SecurityError",
        });
        const viewBefore = result.current.view;

        let deleted: ReturnType<typeof result.current.deleteMap> | undefined;
        act(() => {
          deleted = result.current.deleteMap("map-b");
        });

        expect(deleted).toEqual({
          ok: false,
          notice: indexWriteFailedNotice("マップを削除"),
        });
        expect(entries()[mapBodyKey("map-b")]).toBe("body-b");
        expect(entries()[mapTrashBodyKey("map-b")]).toBeUndefined();
        expect(entries()[MAP_TRASH_INDEX_KEY]).toBeUndefined();
        expect(result.current.view).toBe(viewBefore);
      });

      it("削除の後に flush を再試行し、saved なら saveRetryNotice は null", () => {
        const { result, entries } = setup({ initial: threeMapsInitial() });
        const session = readyView(result.current.view).storageSession;
        const idsAtFlush: string[][] = [];
        const bodyBAtFlush: (string | undefined)[] = [];
        session.registerFlush(() => {
          idsAtFlush.push(storedIndex(entries()).maps.map((map) => map.id));
          bodyBAtFlush.push(entries()[mapBodyKey("map-b")]);
          const written = session.writeBody("edited-a");
          return written.status === "saved"
            ? { status: "saved" }
            : { status: "failed", error: "保存できない" };
        });

        let deleted: ReturnType<typeof result.current.deleteMap> | undefined;
        act(() => {
          deleted = result.current.deleteMap("map-b");
        });

        expect(idsAtFlush).toEqual([["map-a", "map-c"]]);
        expect(bodyBAtFlush).toEqual([undefined]);
        expect(entries()[mapBodyKey("map-a")]).toBe("edited-a");
        expect(deleted).toEqual({
          ok: true,
          remounted: false,
          notice: mapDeletedNotice("B"),
          saveRetryNotice: null,
        });
        // 再試行の保存で更新日時が変わっても、削除した B は戻らない
        expect(storedIndex(entries()).maps.map((map) => map.id)).toEqual([
          "map-a",
          "map-c",
        ]);
        expect(readyView(result.current.view).maps.map((map) => map.id)).toEqual([
          "map-a",
          "map-c",
        ]);
      });

      it("再試行の flush が failed なら、自動保存の失敗と同じ error を saveRetryNotice に返す", () => {
        const { result } = setup({ initial: threeMapsInitial() });
        readyView(result.current.view).storageSession.registerFlush(() => ({
          status: "failed",
          error: "保存できない",
        }));

        let deleted: ReturnType<typeof result.current.deleteMap> | undefined;
        act(() => {
          deleted = result.current.deleteMap("map-b");
        });

        expect(deleted).toEqual({
          ok: true,
          remounted: false,
          notice: mapDeletedNotice("B"),
          saveRetryNotice: { kind: "error", message: AUTO_SAVE_FAILURE_MESSAGE },
        });
        expect(readyView(result.current.view).maps.map((map) => map.id)).toEqual([
          "map-c",
          "map-a",
        ]);
      });
    });

    describe("開いているマップ", () => {
      it("最後に更新した別のマップを開き、旧セッションの保存待ちは本体を書き戻さない", () => {
        const holder: { session: MapStorageSession | null } = { session: null };
        const lateWrites: ReturnType<MapStorageSession["writeBody"]>[] = [];
        const { result, operations, entries } = setup({
          initial: threeMapsInitial(),
          beforeRemoveItem: (key) => {
            if (key === mapBodyKey("map-a") && holder.session !== null) {
              lateWrites.push(holder.session.writeBody("late"));
            }
          },
        });
        const oldSession = readyView(result.current.view).storageSession;
        holder.session = oldSession;
        const flush = jest.fn(() => ({ status: "saved" as const }));
        oldSession.registerFlush(flush);
        const before = operations.length;

        let deleted: ReturnType<typeof result.current.deleteMap> | undefined;
        act(() => {
          deleted = result.current.deleteMap("map-a");
        });

        expect(deleted).toEqual({
          ok: true,
          remounted: true,
          notice: currentMapDeletedNotice("A", "B"),
          saveRetryNotice: null,
        });
        expect(lateWrites).toEqual([{ status: "inactive" }]);
        expect(flush).not.toHaveBeenCalled();
        expect(
          operations.slice(before).map((operation) => [operation.type, operation.key]),
        ).toEqual([
          ["setItem", mapTrashBodyKey("map-a")],
          ["setItem", MAP_TRASH_INDEX_KEY],
          ["setItem", MAP_INDEX_STORAGE_KEY],
          ["removeItem", mapBodyKey("map-a")],
          ["setItem", MAP_LIBRARY_META_STORAGE_KEY],
        ]);
        expect(entries()[mapBodyKey("map-a")]).toBeUndefined();
        expect(entries()[mapTrashBodyKey("map-a")]).toBe("body-a");
        expect(storedIndex(entries()).currentMapId).toBe("map-b");
        const view = readyView(result.current.view);
        expect(view.currentMap.id).toBe("map-b");
        expect(view.storageSession.mapId).toBe("map-b");
        expect(view.storageSession).not.toBe(oldSession);
        expect(view.maps.map((map) => map.id)).toEqual(["map-b", "map-c"]);
        expect(view.trashEntries.map((item) => item.id)).toEqual(["map-a"]);
      });

      it("削除した後、インデックスに無いマップの旧セッションの writeBody は inactive で何も書かない", () => {
        const { result, operations, entries } = setup({ initial: threeMapsInitial() });
        const oldSession = readyView(result.current.view).storageSession;

        act(() => {
          result.current.deleteMap("map-a");
        });
        const before = operations.length;

        let written: ReturnType<MapStorageSession["writeBody"]> | undefined;
        act(() => {
          written = oldSession.writeBody("late");
        });

        expect(written).toEqual({ status: "inactive" });
        expect(operations.slice(before)).toEqual([]);
        expect(entries()[mapBodyKey("map-a")]).toBeUndefined();
        expect(storedIndex(entries()).maps.map((map) => map.id)).toEqual([
          "map-c",
          "map-b",
        ]);
      });

      it("本体の削除に失敗したら、次のマップを開き、warning だけを返す", () => {
        const { result, entries } = setup({
          initial: threeMapsInitial(),
          failRemoveItem: (key) => key === mapBodyKey("map-a"),
        });

        let deleted: ReturnType<typeof result.current.deleteMap> | undefined;
        act(() => {
          deleted = result.current.deleteMap("map-a");
        });

        expect(deleted).toEqual({
          ok: true,
          remounted: true,
          notice: currentBodyRemovalFailedNotice("A", "B"),
          saveRetryNotice: null,
        });
        expect(entries()[mapBodyKey("map-a")]).toBe("body-a");
        expect(readyView(result.current.view).currentMap.id).toBe("map-b");
      });

      it("インデックスの書き込みに失敗したら中止し、旧セッションはまだ保存できる", () => {
        const { result, entries, setFailIndexWrite } = setup({
          initial: threeMapsInitial(),
        });
        const viewBefore = result.current.view;
        const oldSession = readyView(viewBefore).storageSession;
        setFailIndexWrite(true);

        let deleted: ReturnType<typeof result.current.deleteMap> | undefined;
        act(() => {
          deleted = result.current.deleteMap("map-a");
        });

        expect(deleted).toEqual({
          ok: false,
          notice: indexWriteFailedNotice("マップを削除"),
          canPermanentDelete: true,
        });
        expect(result.current.view).toBe(viewBefore);
        expect(entries()[mapBodyKey("map-a")]).toBe("body-a");
        expect(entries()[mapTrashBodyKey("map-a")]).toBeUndefined();

        setFailIndexWrite(false);
        let written: ReturnType<MapStorageSession["writeBody"]> | undefined;
        act(() => {
          written = oldSession.writeBody("edited-a");
        });
        expect(written).toEqual({ status: "saved" });
        expect(entries()[mapBodyKey("map-a")]).toBe("edited-a");
      });
    });

    describe("最後の1つ", () => {
      it("新しい「無題のマップ」を開き、その本体は書かない。孤立した本体と同じ id は作り直す", () => {
        const { result, operations, entries } = setup({
          initial: singleMapInitial({ [mapBodyKey("orphan")]: "old-body" }),
          ids: ["orphan", "only", "new-1"],
        });
        const oldSession = readyView(result.current.view).storageSession;
        const flush = jest.fn(() => ({ status: "saved" as const }));
        oldSession.registerFlush(flush);
        const before = operations.length;

        let deleted: ReturnType<typeof result.current.deleteMap> | undefined;
        act(() => {
          deleted = result.current.deleteMap("only");
        });

        expect(deleted).toEqual({
          ok: true,
          remounted: true,
          notice: lastMapDeletedNotice("唯一"),
          saveRetryNotice: null,
        });
        expect(flush).not.toHaveBeenCalled();
        expect(
          operations.slice(before).map((operation) => [operation.type, operation.key]),
        ).toEqual([
          ["setItem", mapTrashBodyKey("only")],
          ["setItem", MAP_TRASH_INDEX_KEY],
          ["setItem", MAP_INDEX_STORAGE_KEY],
          ["removeItem", mapBodyKey("only")],
          ["setItem", MAP_LIBRARY_META_STORAGE_KEY],
        ]);
        const expected = {
          id: "new-1",
          name: "無題のマップ",
          createdAt: NOW,
          updatedAt: NOW,
        };
        expect(storedIndex(entries()).currentMapId).toBe("new-1");
        expect(storedIndex(entries()).maps).toEqual([expected]);
        expect(entries()[mapBodyKey("new-1")]).toBeUndefined();
        expect(entries()[mapBodyKey("orphan")]).toBe("old-body");
        expect(entries()[mapTrashBodyKey("only")]).toBe("body-only");
        const view = readyView(result.current.view);
        expect(view.currentMap).toEqual(expected);
        expect(view.maps).toEqual([expected]);
        expect(view.trashEntries.map((item) => item.id)).toEqual(["only"]);
        expect(view.storageSession.mapId).toBe("new-1");
        expect(oldSession.writeBody("late")).toEqual({ status: "inactive" });
        expect(entries()[mapBodyKey("only")]).toBeUndefined();
      });

      it("本体の削除に失敗したら、新しいマップを開き、warning だけを返す", () => {
        const { result, entries } = setup({
          initial: singleMapInitial(),
          ids: ["new-1"],
          failRemoveItem: (key) => key === mapBodyKey("only"),
        });

        let deleted: ReturnType<typeof result.current.deleteMap> | undefined;
        act(() => {
          deleted = result.current.deleteMap("only");
        });

        expect(deleted).toEqual({
          ok: true,
          remounted: true,
          notice: lastBodyRemovalFailedNotice("唯一"),
          saveRetryNotice: null,
        });
        expect(entries()[mapBodyKey("only")]).toBe("body-only");
        expect(readyView(result.current.view).currentMap.id).toBe("new-1");
      });

      it("使える id を作れなければ ok: false で何も書かない", () => {
        const { result, operations } = setup({
          initial: singleMapInitial(),
          ids: Array.from({ length: 10 }, () => "only"),
        });
        const viewBefore = result.current.view;
        const before = operations.length;

        let deleted: ReturnType<typeof result.current.deleteMap> | undefined;
        act(() => {
          deleted = result.current.deleteMap("only");
        });

        expect(deleted).toEqual({ ok: false, notice: mapIdUnavailableNotice() });
        expect(operations.slice(before)).toEqual([]);
        expect(result.current.view).toBe(viewBefore);
      });
    });

    it("存在しない id なら ok: false で何も書かない", () => {
      const { result, operations } = setup({ initial: threeMapsInitial() });
      const viewBefore = result.current.view;
      const before = operations.length;

      let deleted: ReturnType<typeof result.current.deleteMap> | undefined;
      act(() => {
        deleted = result.current.deleteMap("missing");
      });

      expect(deleted).toEqual({
        ok: false,
        notice: indexWriteFailedNotice("マップを削除"),
      });
      expect(operations.slice(before)).toEqual([]);
      expect(result.current.view).toBe(viewBefore);
    });
  });

  describe("保護モード", () => {
    it("旧キーの移行に失敗したら、旧キーの生の文字列を readBody で返し、何も書かない", () => {
      const recording = createRecordingStorage({
        initial: { [MAP_STORAGE_KEY]: LEGACY_JSON },
        failSetItem: (key) => key === mapBodyKey("migrated"),
        failSetItemError: "SecurityError",
      });
      const deps: MapLibraryDeps = {
        getStorage: () => recording.storage,
        now: () => new Date(NOW),
        generateId: idSequence(["migrated", "memory"]),
      };
      const { result } = renderHook(() => useMapLibrary(deps));

      const view = readyView(result.current.view);
      expect(view.storageMode).toBe("protected");
      expect(view.currentMap.id).toBe("memory");
      expect(view.startupNotice).toEqual({
        kind: "error",
        message:
          "以前の保存データを新しい形式へ移行できませんでした。この画面での変更は保存されません。必要な場合はJSONで書き出してください。",
      });
      expect(view.storageSession.readBody()).toEqual({ ok: true, value: LEGACY_JSON });

      const before = recording.operations.length;
      expect(view.storageSession.writeBody("x")).toEqual({ status: "inactive" });
      act(() => {
        result.current.createMap("新しい地図");
        result.current.renameMap("memory", "新しい名前");
        result.current.deleteMap("memory");
      });
      expect(recording.operations.slice(before)).toEqual([]);
      expect(recording.entries()).toEqual({ [MAP_STORAGE_KEY]: LEGACY_JSON });
    });

    it("getStorage が null なら保護モードのセッションを渡し、操作は何もしない", () => {
      const deps: MapLibraryDeps = {
        getStorage: () => null,
        now: () => new Date(NOW),
        generateId: idSequence(["memory"]),
      };
      const { result } = renderHook(() => useMapLibrary(deps));

      const view = readyView(result.current.view);
      expect(view.storageMode).toBe("protected");
      expect(view.currentMap.id).toBe("memory");
      expect(view.currentMap.name).toBe("無題のマップ");
      expect(view.maps).toEqual([view.currentMap]);
      expect(view.startupNotice?.kind).toBe("warning");
      expect(view.storageSession.writeBody("x")).toEqual({ status: "inactive" });
      expect(view.storageSession.readBody()).toEqual({ ok: true, value: null });

      let created: ReturnType<typeof result.current.createMap> | undefined;
      act(() => {
        created = result.current.createMap("新しい地図");
      });
      expect(created).toEqual({
        ok: false,
        notice: indexWriteFailedNotice("マップを作成"),
      });
      expect(readyView(result.current.view).currentMap.id).toBe("memory");

      let switched: ReturnType<typeof result.current.switchMap> | undefined;
      act(() => {
        switched = result.current.switchMap("memory");
      });
      expect(switched).toEqual({
        ok: false,
        notice: indexWriteFailedNotice("マップを切り替え"),
      });

      let renamed: ReturnType<typeof result.current.renameMap> | undefined;
      act(() => {
        renamed = result.current.renameMap("memory", "新しい名前");
      });
      expect(renamed).toEqual({
        ok: false,
        notice: indexWriteFailedNotice("名前を変更"),
      });

      let deleted: ReturnType<typeof result.current.deleteMap> | undefined;
      act(() => {
        deleted = result.current.deleteMap("memory");
      });
      expect(deleted).toEqual({
        ok: false,
        notice: indexWriteFailedNotice("マップを削除"),
      });

      let permanentlyDeleted: ReturnType<typeof result.current.permanentlyDeleteMap> | undefined;
      let restored: ReturnType<typeof result.current.restoreFromTrash> | undefined;
      let trashDeleted: ReturnType<typeof result.current.permanentlyDeleteFromTrash> | undefined;
      let emptied: ReturnType<typeof result.current.emptyTrash> | undefined;
      act(() => {
        result.current.refreshTrash();
        permanentlyDeleted = result.current.permanentlyDeleteMap("memory");
        restored = result.current.restoreFromTrash("t-1");
        trashDeleted = result.current.permanentlyDeleteFromTrash("t-1");
        emptied = result.current.emptyTrash();
      });
      expect(permanentlyDeleted).toEqual({
        ok: false,
        notice: indexWriteFailedNotice("マップを削除"),
      });
      expect(restored).toEqual({
        ok: false,
        notice: trashRestoreWriteFailedNotice(),
      });
      expect(trashDeleted).toEqual({
        ok: false,
        notice: trashPermanentDeleteFailedNotice(),
      });
      expect(emptied).toEqual({
        ok: false,
        notice: trashEmptyFailedNotice(),
      });

      const viewAfter = readyView(result.current.view);
      expect(viewAfter.currentMap.id).toBe("memory");
      expect(viewAfter.currentMap.name).toBe("無題のマップ");
      expect(viewAfter.trashStatus).toBe("ok");
      expect(viewAfter.trashEntries).toEqual([]);
    });
  });
});

describe("useMapLibrary のライブラリバックアップ境界", () => {
  it("保存成功実績の無い復元失敗 editor は書き出せず、実保存後は最新 snapshot を含める", () => {
    const { result } = setup({ initial: singleMapInitial() });
    const session = readyView(result.current.view).storageSession;
    let json = EMPTY_V3;
    let saved = false;
    session.registerBackupSnapshot(() => ({ json, hydrated: true, restoreOrigin: "failed", hasSavedBodyThisMount: saved }));
    expect(result.current.prepareBackup().ok).toBe(false);
    act(() => { expect(session.writeBody(json).status).toBe("saved"); });
    saved = true;
    json = '{"version":3,"layoutMode":"auto","nodes":[]}';
    const prepared = result.current.prepareBackup();
    expect(prepared.ok).toBe(true);
    if (prepared.ok) expect(JSON.parse(prepared.value.json).maps[0].document.layoutMode).toBe("auto");
  });

  it("確認後に一覧が変われば download を拒否し、click 例外も成功にしない", () => {
    const { result, entries, storage } = setup({ initial: singleMapInitial() });
    readyView(result.current.view).storageSession.registerBackupSnapshot(() => ({
      json: EMPTY_V3, hydrated: true, restoreOrigin: "restored", hasSavedBodyThisMount: false,
    }));
    const prepared = result.current.prepareBackup();
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    storage.setItem(MAP_INDEX_STORAGE_KEY, `${entries()[MAP_INDEX_STORAGE_KEY]} `);
    expect(result.current.downloadBackup(prepared.value).ok).toBe(false);
    storage.setItem(MAP_INDEX_STORAGE_KEY, prepared.value.indexRaw);
    const oldCreate = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    const oldRevoke = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
    URL.createObjectURL = jest.fn(() => "blob:test");
    URL.revokeObjectURL = jest.fn();
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => { throw new Error("click failed"); });
    expect(result.current.downloadBackup(prepared.value).ok).toBe(false);
    click.mockRestore();
    if (oldCreate) Object.defineProperty(URL, "createObjectURL", oldCreate);
    else delete (URL as unknown as Record<string, unknown>).createObjectURL;
    if (oldRevoke) Object.defineProperty(URL, "revokeObjectURL", oldRevoke);
    else delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
  });

  it("file 読込中の A→B→A で古い preview を返さない", async () => {
    const { result } = setup({ initial: twoMapsInitial() });
    let release!: (json: string) => void;
    const file = backupFile(() => new Promise(resolve => { release = resolve; }));
    let pending!: ReturnType<typeof result.current.previewRestore>;
    act(() => { pending = result.current.previewRestore(file); });
    act(() => {
      result.current.switchMap("map-2");
      result.current.switchMap("map-1");
      release(BACKUP_FILE_JSON);
    });
    const preview = await pending;
    expect(preview.ok).toBe(false);
  });

  it("flush failed と flush による一覧更新は追加復元を拒否する", async () => {
    const { result, entries } = setup({ initial: singleMapInitial() });
    const preview = await result.current.previewRestore(backupFile());
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const session = readyView(result.current.view).storageSession;
    const unregister = session.registerFlush(() => ({ status: "failed", error: "raw secret" }));
    expect(result.current.confirmRestore(preview.value).ok).toBe(false);
    unregister();
    session.registerBackupSnapshot(() => ({ json: EMPTY_V3, hydrated: true, restoreOrigin: "restored", hasSavedBodyThisMount: false }));
    session.registerFlush(() => { session.writeBody(EMPTY_V3); return { status: "saved" }; });
    act(() => { expect(result.current.confirmRestore(preview.value).ok).toBe(false); });
    expect(storedIndex(entries()).maps).toHaveLength(1);
  });

  it("flush unchanged だけでは初回復元失敗の editor を復元資格ありと扱わない", async () => {
    const { result, entries } = setup({ initial: singleMapInitial(), ids: ["new-source"] });
    const session = readyView(result.current.view).storageSession;
    session.registerBackupSnapshot(() => ({
      json: EMPTY_V3, hydrated: true, restoreOrigin: "failed", hasSavedBodyThisMount: false,
    }));
    const preview = await result.current.previewRestore(backupFile());
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(result.current.confirmRestore(preview.value).ok).toBe(false);
    expect(storedIndex(entries()).maps).toHaveLength(1);
    expect(entries()[LIBRARY_RESTORE_JOURNAL_KEY]).toBeUndefined();
  });

  it("初回復元失敗の実保存後は後続の編集を追加復元できる", async () => {
    const { result, entries } = setup({ initial: singleMapInitial(), ids: ["new-source"] });
    const session = readyView(result.current.view).storageSession;
    let json = EMPTY_V3;
    let saved = false;
    session.registerBackupSnapshot(() => ({ json, hydrated: true, restoreOrigin: "failed", hasSavedBodyThisMount: saved }));
    const preview = await result.current.previewRestore(backupFile());
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(result.current.confirmRestore(preview.value).ok).toBe(false);
    act(() => { expect(session.writeBody(json).status).toBe("saved"); });
    saved = true;
    json = '{"version":3,"layoutMode":"auto","nodes":[]}';
    const afterSave = await result.current.previewRestore(backupFile());
    expect(afterSave.ok).toBe(true);
    if (!afterSave.ok) return;
    act(() => { expect(result.current.confirmRestore(afterSave.value).ok).toBe(true); });
    expect(storedIndex(entries()).maps).toHaveLength(2);
    expect(readyView(result.current.view).storageSession).toBe(session);
  });

  it("追加復元の書込直前に未保存の復元失敗 snapshot へ変われば書き込まない", async () => {
    let snapshot: MapBackupSnapshot = { json: EMPTY_V3, hydrated: true, restoreOrigin: "restored", hasSavedBodyThisMount: false };
    const { result, entries } = setup({
      initial: singleMapInitial(), ids: ["new-source"],
      onGenerateId: () => { snapshot = { ...snapshot, restoreOrigin: "failed" }; },
    });
    readyView(result.current.view).storageSession.registerBackupSnapshot(() => snapshot);
    const preview = await result.current.previewRestore(backupFile());
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(result.current.confirmRestore(preview.value).ok).toBe(false);
    expect(storedIndex(entries()).maps).toHaveLength(1);
    expect(entries()[LIBRARY_RESTORE_JOURNAL_KEY]).toBeUndefined();
  });

  it("復元成功は既存 session と現在本体を維持して新規 ID を追加する", async () => {
    const { result, entries } = setup({ initial: singleMapInitial(), ids: ["new-source"] });
    const session = readyView(result.current.view).storageSession;
    session.registerBackupSnapshot(() => ({ json: EMPTY_V3, hydrated: true, restoreOrigin: "restored", hasSavedBodyThisMount: false }));
    const preview = await result.current.previewRestore(backupFile());
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    let outcome: ReturnType<typeof result.current.confirmRestore> | undefined;
    act(() => { outcome = result.current.confirmRestore(preview.value); });
    expect(outcome).toMatchObject({ ok: true, remounted: false });
    expect(readyView(result.current.view).storageSession).toBe(session);
    expect(storedIndex(entries()).currentMapId).toBe("only");
    expect(entries()[mapBodyKey("only")]).toBe("body-only");
    expect(entries()[mapBodyKey("new-source")]).toBe(EMPTY_V3);
  });

  it("復元確定中に再入した一覧操作と backup/restore を拒否する", async () => {
    let reentered: boolean[] = [];
    const state: {
      result?: ReturnType<typeof useMapLibrary>;
      restorePreview?: Awaited<ReturnType<ReturnType<typeof useMapLibrary>["previewRestore"]>>;
      backupPreview?: ReturnType<ReturnType<typeof useMapLibrary>["prepareBackup"]>;
      session?: MapStorageSession;
    } = {};
    const { result } = setup({
      initial: singleMapInitial(), ids: ["new-source"],
      beforeRemoveItem: (key) => {
        if (key !== LIBRARY_RESTORE_JOURNAL_KEY) return;
        reentered = [
          state.result!.createMap("再入"), state.result!.switchMap("only"),
          state.result!.renameMap("only", "再入"), state.result!.deleteMap("only"),
          state.result!.moveBranchToMap(state.session!, "only", 1),
          state.result!.downloadBackup(state.backupPreview!.ok ? state.backupPreview!.value : ({} as never)),
          state.result!.confirmRestore(state.restorePreview!.ok ? state.restorePreview!.value : ({} as never)),
        ].map(outcome => outcome.ok);
        reentered.push(state.result!.prepareBackup().ok);
      },
    });
    state.result = result.current;
    const session = state.session = readyView(result.current.view).storageSession;
    session.registerBackupSnapshot(() => ({ json: EMPTY_V3, hydrated: true, restoreOrigin: "restored", hasSavedBodyThisMount: false }));
    state.backupPreview = result.current.prepareBackup();
    const preview = await result.current.previewRestore(backupFile());
    state.restorePreview = preview;
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    act(() => { expect(result.current.confirmRestore(preview.value).ok).toBe(true); });
    expect(reentered).toEqual([false, false, false, false, false, false, false, false]);
  });

  it("rollback 不能時は書込直前の最新 JSON を保護 session へ渡す", async () => {
    const { result } = setup({ initial: singleMapInitial(), ids: ["new-source"],
      failRemoveItem: key => key === LIBRARY_RESTORE_JOURNAL_KEY });
    const session = readyView(result.current.view).storageSession;
    let json = EMPTY_V3;
    session.registerBackupSnapshot(() => ({ json, hydrated: true, restoreOrigin: "restored", hasSavedBodyThisMount: false }));
    const preview = await result.current.previewRestore(backupFile());
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    json = '{"version":3,"layoutMode":"auto","nodes":[]}';
    let outcome: ReturnType<typeof result.current.confirmRestore> | undefined;
    act(() => { outcome = result.current.confirmRestore(preview.value); });
    expect(outcome).toMatchObject({ ok: false, enteredProtectedMode: true });
    const view = readyView(result.current.view);
    expect(view.storageMode).toBe("protected");
    expect(view.storageSession).not.toBe(session);
    expect(view.storageSession.readBody()).toEqual({ ok: true, value: json });
  });

  it("復元計画中に editor が変われば保護 session は書込直前の内容を採る", async () => {
    const latest = '{"version":3,"layoutMode":"auto","nodes":[]}';
    let json = EMPTY_V3;
    const { result } = setup({ initial: singleMapInitial(), ids: ["new-source"],
      failRemoveItem: key => key === LIBRARY_RESTORE_JOURNAL_KEY,
      onGenerateId: () => { json = latest; },
    });
    const session = readyView(result.current.view).storageSession;
    session.registerBackupSnapshot(() => ({ json, hydrated: true, restoreOrigin: "restored", hasSavedBodyThisMount: false }));
    const preview = await result.current.previewRestore(backupFile());
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    act(() => { expect(result.current.confirmRestore(preview.value)).toMatchObject({ ok: false, enteredProtectedMode: true }); });
    expect(readyView(result.current.view).storageSession.readBody()).toEqual({ ok: true, value: latest });
  });

  describe("競合検知とガード（Task 3）", () => {
    it("saveCurrentAsNewMap は旧マップの flush をバイパスし、新マップを保存して切り替える（知見 L-061）", () => {
      const { result, entries } = setup({
        initial: twoMapsInitial(),
        ids: ["evacuated-map-id"],
      });
      const session = readyView(result.current.view).storageSession;
      const flushSpy = jest.fn(() => ({ status: "conflict" as const }));
      session.registerFlush(flushSpy);

      const snapshotJson = '{"version":3,"layoutMode":"manual","nodes":[{"id":1,"label":"退避ノード"}]}';
      let outcome: ReturnType<ReturnType<typeof useMapLibrary>["saveCurrentAsNewMap"]>;
      act(() => {
        outcome = result.current.saveCurrentAsNewMap("退避マップ", snapshotJson);
      });

      // 旧マップへの flush は一切呼ばれない
      expect(flushSpy).not.toHaveBeenCalled();
      expect(outcome!.ok).toBe(true);

      const view = readyView(result.current.view);
      expect(view.currentMap.id).toBe("evacuated-map-id");
      expect(view.currentMap.name).toBe("退避マップ");
      expect(entries()[mapBodyKey("evacuated-map-id")]).toBe(snapshotJson);
      expect(storedIndex(entries()).currentMapId).toBe("evacuated-map-id");
    });

    it("saveCurrentAsNewMap は不正なマップ名の場合は保存せずエラーを返す", () => {
      const { result, entries } = setup({ initial: twoMapsInitial(), ids: ["evac-id"] });
      let outcome: ReturnType<ReturnType<typeof useMapLibrary>["saveCurrentAsNewMap"]>;
      act(() => {
        outcome = result.current.saveCurrentAsNewMap("a".repeat(51), "{}");
      });
      expect(outcome!.ok).toBe(false);
      expect(storedIndex(entries()).currentMapId).toBe("map-1");
    });

    it("switchMap は flush が conflict を返したときに安全に中断し、競合通知を返す", () => {
      const { result } = setup({ initial: twoMapsInitial() });
      const session = readyView(result.current.view).storageSession;
      session.registerFlush(() => ({ status: "conflict" }));

      let outcome: ReturnType<ReturnType<typeof useMapLibrary>["switchMap"]>;
      act(() => {
        outcome = result.current.switchMap("map-2");
      });

      expect(outcome!.ok).toBe(false);
      expect(outcome!.notice?.message).toBe(
        "競合中のため切り替えられません。『別名で保存』または『最新を読み込む』で解決してください。",
      );
      expect(readyView(result.current.view).currentMap.id).toBe("map-1");
    });

    it("moveBranchToMap は flush が conflict を返したときに枝移動を拒否する", () => {
      const { result } = setup({ initial: twoMapsInitial() });
      const session = readyView(result.current.view).storageSession;
      session.registerFlush(() => ({ status: "conflict" }));

      let outcome: ReturnType<ReturnType<typeof useMapLibrary>["moveBranchToMap"]>;
      act(() => {
        outcome = result.current.moveBranchToMap(session, "map-2", 1);
      });

      expect(outcome!.ok).toBe(false);
      expect(outcome!.notice?.message).toBe(
        "別タブでマップが更新または削除されているため、枝を移動できませんでした。",
      );
    });

    it("confirmRestore は flush が conflict を返したときに復元を拒否する", async () => {
      const { result } = setup({ initial: singleMapInitial(), ids: ["new-source"] });
      const session = readyView(result.current.view).storageSession;
      session.registerBackupSnapshot(() => ({
        json: EMPTY_V3,
        hydrated: true,
        restoreOrigin: "restored",
        hasSavedBodyThisMount: false,
      }));
      const preview = await result.current.previewRestore(backupFile());
      expect(preview.ok).toBe(true);
      if (!preview.ok) return;

      // flush が conflict を返すように登録
      session.registerFlush(() => ({ status: "conflict" }));

      let outcome: ReturnType<ReturnType<typeof useMapLibrary>["confirmRestore"]>;
      act(() => {
        outcome = result.current.confirmRestore(preview.value);
      });

      expect(outcome!.ok).toBe(false);
      expect(outcome!.notice?.message).toBe(
        "別タブで競合または更新が発生しているため、一括復元できませんでした。",
      );
    });

    it("createMap は flush が conflict の場合でも旧マップ flush をバイパスして新規マップ作成を継続する", () => {
      const { result, entries } = setup({ initial: twoMapsInitial(), ids: ["created-map-id"] });
      const session = readyView(result.current.view).storageSession;
      session.registerFlush(() => ({ status: "conflict" }));

      let outcome: ReturnType<ReturnType<typeof useMapLibrary>["createMap"]>;
      act(() => {
        outcome = result.current.createMap("新規マップ");
      });

      expect(outcome!.ok).toBe(true);
      expect(readyView(result.current.view).currentMap.id).toBe("created-map-id");
      expect(readyView(result.current.view).currentMap.name).toBe("新規マップ");
      expect(storedIndex(entries()).currentMapId).toBe("created-map-id");
    });
  });

  describe("ゴミ箱（削除・完全削除・復元・空にする・同期）", () => {
    it("開いているマップを削除するとき、適格な編集スナップショットがあれば未保存編集をゴミ箱へ保存する", () => {
      const { result, entries } = setup({ initial: twoMapsInitial() });
      const edited = '{"version":3,"layoutMode":"auto","nodes":[]}';
      readyView(result.current.view).storageSession.registerBackupSnapshot(() => ({
        json: edited,
        hydrated: true,
        restoreOrigin: "restored",
        hasSavedBodyThisMount: false,
      }));

      act(() => {
        expect(result.current.deleteMap("map-1").ok).toBe(true);
      });

      expect(entries()[mapTrashBodyKey("map-1")]).toBe(edited);
      expect(storedTrashIndex(entries()).items[0]?.hasBody).toBe(true);
    });

    it("開いているマップが未保存・未編集の空マップのときは hasBody: false でゴミ箱本体を書かない", () => {
      const index: MapIndexV1 = {
        version: 1,
        currentMapId: "empty-map",
        maps: [entry("empty-map", "空マップ"), entry("map-2", "マップ 2")],
        legacyCleanupPending: false,
      };
      const { result, entries } = setup({
        initial: {
          [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
          [mapBodyKey("map-2")]: EMPTY_V3,
        },
      });
      readyView(result.current.view).storageSession.registerBackupSnapshot(() => ({
        json: EMPTY_V3,
        hydrated: true,
        restoreOrigin: "empty",
        hasSavedBodyThisMount: false,
      }));

      act(() => {
        expect(result.current.deleteMap("empty-map").ok).toBe(true);
      });

      expect(entries()[mapTrashBodyKey("empty-map")]).toBeUndefined();
      expect(storedTrashIndex(entries()).items[0]?.hasBody).toBe(false);
    });

    describe("permanentlyDeleteMap（フォールバック完全削除）", () => {
      it("ゴミ箱が破損していてもゴミ箱キーに触れず非現在マップを完全削除し、flush を再試行する", () => {
        const { result, operations, entries } = setup({
          initial: {
            ...threeMapsInitial(),
            [MAP_TRASH_INDEX_KEY]: "{corrupt",
          },
        });
        const flush = jest.fn(() => ({ status: "saved" as const }));
        readyView(result.current.view).storageSession.registerFlush(flush);
        const before = operations.length;

        let deleted: ReturnType<typeof result.current.permanentlyDeleteMap> | undefined;
        act(() => {
          deleted = result.current.permanentlyDeleteMap("map-b");
        });

        expect(deleted).toEqual({
          ok: true,
          remounted: false,
          notice: mapPermanentlyDeletedNotice("B"),
          saveRetryNotice: null,
        });
        expect(flush).toHaveBeenCalledTimes(1);
        expect(
          operations.slice(before).map((op) => [op.type, op.key]),
        ).toEqual([
          ["setItem", MAP_INDEX_STORAGE_KEY],
          ["removeItem", mapBodyKey("map-b")],
        ]);
        expect(entries()[MAP_TRASH_INDEX_KEY]).toBe("{corrupt");
        expect(entries()[mapBodyKey("map-b")]).toBeUndefined();
      });

      it("開いているマップの完全削除で旧セッションを無効化し、次のマップと最後の1件の通知を返す", () => {
        const { result } = setup({ initial: twoMapsInitial() });
        const oldSession = readyView(result.current.view).storageSession;
        let currentOk: ReturnType<typeof result.current.permanentlyDeleteMap> | undefined;
        act(() => {
          currentOk = result.current.permanentlyDeleteMap("map-1");
        });
        expect(currentOk).toEqual({
          ok: true,
          remounted: true,
          notice: currentMapPermanentlyDeletedNotice("マップ 1", "マップ 2"),
          saveRetryNotice: null,
        });
        expect(oldSession.writeBody("late")).toEqual({ status: "inactive" });
        expect(readyView(result.current.view).currentMap.id).toBe("map-2");

        const { result: single } = setup({
          initial: singleMapInitial(),
          ids: ["fresh-1"],
        });
        const singleOldSession = readyView(single.current.view).storageSession;
        let last: ReturnType<typeof single.current.permanentlyDeleteMap> | undefined;
        act(() => {
          last = single.current.permanentlyDeleteMap("only");
        });
        expect(last).toEqual({
          ok: true,
          remounted: true,
          notice: lastMapPermanentlyDeletedNotice("唯一"),
          saveRetryNotice: null,
        });
        expect(singleOldSession.writeBody("late")).toEqual({ status: "inactive" });
        expect(readyView(single.current.view).currentMap.id).toBe("fresh-1");
      });

      it("本体削除に失敗したら現在・非現在・最後の1件それぞれで warning 通知を返す", () => {
        const { result: currentFail } = setup({
          initial: twoMapsInitial(),
          failRemoveItem: (key) => key === mapBodyKey("map-1"),
        });
        let first: ReturnType<typeof currentFail.current.permanentlyDeleteMap> | undefined;
        act(() => {
          first = currentFail.current.permanentlyDeleteMap("map-1");
        });
        expect(first).toEqual({
          ok: true,
          remounted: true,
          notice: currentPermanentBodyRemovalFailedNotice("マップ 1", "マップ 2"),
          saveRetryNotice: null,
        });

        const { result: two } = setup({
          initial: twoMapsInitial(),
          failRemoveItem: (key) => key === mapBodyKey("map-2"),
        });
        let other: ReturnType<typeof two.current.permanentlyDeleteMap> | undefined;
        act(() => {
          other = two.current.permanentlyDeleteMap("map-2");
        });
        expect(other).toEqual({
          ok: true,
          remounted: false,
          notice: permanentBodyRemovalFailedNotice("マップ 2"),
          saveRetryNotice: null,
        });

        const { result: single } = setup({
          initial: singleMapInitial(),
          ids: ["fresh-2"],
          failRemoveItem: (key) => key === mapBodyKey("only"),
        });
        let last: ReturnType<typeof single.current.permanentlyDeleteMap> | undefined;
        act(() => {
          last = single.current.permanentlyDeleteMap("only");
        });
        expect(last).toEqual({
          ok: true,
          remounted: true,
          notice: lastPermanentBodyRemovalFailedNotice("唯一"),
          saveRetryNotice: null,
        });
      });
    });

    describe("restoreFromTrash（復元）", () => {
      it("元の ID が未使用なら同 ID で復元し、現在のマップ・セッションを維持し、最後のゴミ箱項目ならゴミ箱インデックスを削除する", () => {
        const item = trashEntry({
          id: "old-map",
          originalMapId: "old-map",
          name: "復元対象",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-02-01T00:00:00.000Z",
        });
        const { result, entries } = setup({
          initial: {
            ...singleMapInitial(),
            [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({ version: 1, items: [item] }),
            [mapTrashBodyKey("old-map")]: EMPTY_V3,
          },
        });
        const sessionBefore = readyView(result.current.view).storageSession;

        let restored: ReturnType<typeof result.current.restoreFromTrash> | undefined;
        act(() => {
          restored = result.current.restoreFromTrash("old-map");
        });

        expect(restored).toEqual({
          ok: true,
          remounted: false,
          notice: trashRestoredNotice("復元対象"),
          saveRetryNotice: null,
        });
        const view = readyView(result.current.view);
        expect(view.currentMap.id).toBe("only");
        expect(view.storageSession).toBe(sessionBefore);
        expect(view.trashEntries).toEqual([]);
        expect(entries()[mapBodyKey("old-map")]).toBe(EMPTY_V3);
        expect(entries()[mapTrashBodyKey("old-map")]).toBeUndefined();
        expect(entries()[MAP_TRASH_INDEX_KEY]).toBeUndefined();
        expect(storedIndex(entries()).maps).toContainEqual({
          id: "old-map",
          name: "復元対象",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-02-01T00:00:00.000Z",
        });
      });

      it("ゴミ箱側の後始末だけ失敗したら復元済みとして warning を返し、view.maps を更新する", () => {
        const item = trashEntry({ id: "t-1", originalMapId: "t-1", name: "復旧" });
        const { result, entries } = setup({
          initial: {
            ...singleMapInitial(),
            [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({ version: 1, items: [item] }),
            [mapTrashBodyKey("t-1")]: EMPTY_V3,
          },
          failRemoveItem: (key) => key === mapTrashBodyKey("t-1"),
        });

        let restored: ReturnType<typeof result.current.restoreFromTrash> | undefined;
        act(() => {
          restored = result.current.restoreFromTrash("t-1");
        });

        expect(restored).toEqual({
          ok: true,
          remounted: false,
          notice: trashRestoredCleanupFailedNotice("復旧"),
          saveRetryNotice: null,
        });
        expect(storedIndex(entries()).maps.map((m) => m.id)).toContain("t-1");
        expect(readyView(result.current.view).maps.map((m) => m.id)).toContain("t-1");
      });

      it("対象が見つからないときやゴミ箱破損時はエラーを返し、view を同期する", () => {
        const { result, storage } = setup({ initial: singleMapInitial() });

        let missing: ReturnType<typeof result.current.restoreFromTrash> | undefined;
        act(() => {
          missing = result.current.restoreFromTrash("non-existent");
        });
        expect(missing).toEqual({ ok: false, notice: trashEntryNotFoundNotice() });

        storage.setItem(MAP_TRASH_INDEX_KEY, "{broken");
        let corrupt: ReturnType<typeof result.current.restoreFromTrash> | undefined;
        act(() => {
          corrupt = result.current.restoreFromTrash("non-existent");
        });
        expect(corrupt).toEqual({ ok: false, notice: trashCorruptNotice() });
        expect(readyView(result.current.view).trashStatus).toBe("corrupt");
      });
    });

    describe("permanentlyDeleteFromTrash（ゴミ箱からの個別完全削除）", () => {
      it("インデックス更新 → 本体削除の順で削除し、最後の1件ならゴミ箱インデックスを削除して view を同期する", () => {
        const item = trashEntry({ id: "t-1", name: "完全削除対象" });
        const { result, operations, entries } = setup({
          initial: {
            ...singleMapInitial(),
            [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({ version: 1, items: [item] }),
            [mapTrashBodyKey("t-1")]: EMPTY_V3,
          },
        });
        const before = operations.length;

        let deleted: ReturnType<typeof result.current.permanentlyDeleteFromTrash> | undefined;
        act(() => {
          deleted = result.current.permanentlyDeleteFromTrash("t-1");
        });

        expect(deleted).toEqual({
          ok: true,
          remounted: false,
          notice: trashEntryPermanentlyDeletedNotice("完全削除対象"),
          saveRetryNotice: null,
        });
        expect(
          operations.slice(before).map((op) => [op.type, op.key]),
        ).toEqual([
          ["removeItem", MAP_TRASH_INDEX_KEY],
          ["removeItem", mapTrashBodyKey("t-1")],
        ]);
        expect(entries()[MAP_TRASH_INDEX_KEY]).toBeUndefined();
        expect(entries()[mapTrashBodyKey("t-1")]).toBeUndefined();
        expect(readyView(result.current.view).trashEntries).toEqual([]);
      });

      it("インデックス更新失敗・本体削除失敗時の warning・破損時の corrupt 同期を返す", () => {
        const item1 = trashEntry({ id: "t-1", name: "対象1" });
        const item2 = trashEntry({ id: "t-2", name: "対象2" });
        const initialTrash = {
          ...singleMapInitial(),
          [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({ version: 1, items: [item1, item2] }),
          [mapTrashBodyKey("t-1")]: EMPTY_V3,
          [mapTrashBodyKey("t-2")]: EMPTY_V3,
        };

        const failIndex = setup({
          initial: initialTrash,
          failSetItem: (key) => key === MAP_TRASH_INDEX_KEY,
        });
        let failed: ReturnType<typeof failIndex.result.current.permanentlyDeleteFromTrash> | undefined;
        act(() => {
          failed = failIndex.result.current.permanentlyDeleteFromTrash("t-1");
        });
        expect(failed).toEqual({ ok: false, notice: trashPermanentDeleteFailedNotice() });
        expect(failIndex.entries()[mapTrashBodyKey("t-1")]).toBe(EMPTY_V3);
        expect(readyView(failIndex.result.current.view).trashEntries.map((i) => i.id)).toEqual(["t-1", "t-2"]);

        const corruptCase = setup({ initial: initialTrash });
        corruptCase.storage.setItem(MAP_TRASH_INDEX_KEY, "{broken");
        let corrupt: ReturnType<typeof corruptCase.result.current.permanentlyDeleteFromTrash> | undefined;
        act(() => {
          corrupt = corruptCase.result.current.permanentlyDeleteFromTrash("t-1");
        });
        expect(corrupt).toEqual({ ok: false, notice: trashCorruptNotice() });
        expect(readyView(corruptCase.result.current.view).trashStatus).toBe("corrupt");

        const failBody = setup({
          initial: initialTrash,
          failRemoveItem: (key) => key === mapTrashBodyKey("t-1"),
        });
        let warned: ReturnType<typeof failBody.result.current.permanentlyDeleteFromTrash> | undefined;
        act(() => {
          warned = failBody.result.current.permanentlyDeleteFromTrash("t-1");
        });
        expect(warned).toEqual({
          ok: true,
          remounted: false,
          notice: trashEntryPermanentlyDeletedBodyWarningNotice("対象1"),
          saveRetryNotice: null,
        });
        expect(readyView(failBody.result.current.view).trashEntries.map((i) => i.id)).toEqual(["t-2"]);
      });
    });

    describe("emptyTrash（ゴミ箱を空にする）", () => {
      it("通常時はすべての本体（孤立本体含む）とインデックスを削除する", () => {
        const item1 = trashEntry({ id: "t-1", hasBody: true });
        const item2 = trashEntry({ id: "t-2", hasBody: false });
        const { result, entries } = setup({
          initial: {
            ...singleMapInitial(),
            [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({ version: 1, items: [item1, item2] }),
            [mapTrashBodyKey("t-1")]: EMPTY_V3,
            [mapTrashBodyKey("orphan-trash")]: EMPTY_V3,
          },
        });

        let emptied: ReturnType<typeof result.current.emptyTrash> | undefined;
        act(() => {
          emptied = result.current.emptyTrash();
        });

        expect(emptied).toEqual({
          ok: true,
          remounted: false,
          notice: trashEmptiedNotice(),
          saveRetryNotice: null,
        });
        expect(entries()[MAP_TRASH_INDEX_KEY]).toBeUndefined();
        expect(entries()[mapTrashBodyKey("t-1")]).toBeUndefined();
        expect(entries()[mapTrashBodyKey("orphan-trash")]).toBeUndefined();
        expect(readyView(result.current.view).trashEntries).toEqual([]);
      });

      it("一部本体の削除に失敗したら残った項目だけを書き戻し warning と view を同期する", () => {
        const item1 = trashEntry({ id: "t-1", hasBody: true });
        const item2 = trashEntry({ id: "t-2", hasBody: true });
        const { result, entries } = setup({
          initial: {
            ...singleMapInitial(),
            [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({ version: 1, items: [item1, item2] }),
            [mapTrashBodyKey("t-1")]: EMPTY_V3,
            [mapTrashBodyKey("t-2")]: EMPTY_V3,
          },
          failRemoveItem: (key) => key === mapTrashBodyKey("t-2"),
        });

        let partial: ReturnType<typeof result.current.emptyTrash> | undefined;
        act(() => {
          partial = result.current.emptyTrash();
        });
        expect(partial).toEqual({ ok: false, notice: trashEmptyPartialWarningNotice() });
        expect(storedTrashIndex(entries()).items.map((i) => i.id)).toEqual(["t-2"]);
        expect(readyView(result.current.view).trashEntries.map((i) => i.id)).toEqual(["t-2"]);
      });

      it("破損時は全ゴミ箱本体キーを削除してからインデックスを初期化し、一部失敗ならインデックスを残す", () => {
        const failClear = setup({
          initial: {
            ...singleMapInitial(),
            [MAP_TRASH_INDEX_KEY]: "{corrupt",
            [mapTrashBodyKey("t-1")]: EMPTY_V3,
          },
          failRemoveItem: (key) => key === mapTrashBodyKey("t-1"),
        });

        let clearFailed: ReturnType<typeof failClear.result.current.emptyTrash> | undefined;
        act(() => {
          clearFailed = failClear.result.current.emptyTrash();
        });
        expect(clearFailed).toEqual({ ok: false, notice: trashCorruptClearFailedNotice() });
        expect(failClear.entries()[MAP_TRASH_INDEX_KEY]).toBe("{corrupt");
        expect(readyView(failClear.result.current.view).trashStatus).toBe("corrupt");

        const okClear = setup({
          initial: {
            ...singleMapInitial(),
            [MAP_TRASH_INDEX_KEY]: "{corrupt",
            [mapTrashBodyKey("t-1")]: EMPTY_V3,
          },
        });
        let cleared: ReturnType<typeof okClear.result.current.emptyTrash> | undefined;
        act(() => {
          cleared = okClear.result.current.emptyTrash();
        });
        expect(cleared).toEqual({
          ok: true,
          remounted: false,
          notice: trashCorruptClearedNotice(),
          saveRetryNotice: null,
        });
        expect(okClear.entries()[MAP_TRASH_INDEX_KEY]).toBeUndefined();
        expect(okClear.entries()[mapTrashBodyKey("t-1")]).toBeUndefined();
        expect(readyView(okClear.result.current.view).trashStatus).toBe("ok");
        expect(readyView(okClear.result.current.view).trashEntries).toEqual([]);
      });

      it("trashStatus が ok の状態から他タブ等でゴミ箱インデックスが破損した後に emptyTrash を呼ぶと、消去せず corrupt 通知と同期を返す", () => {
        const { result, storage, entries } = setup({
          initial: {
            ...singleMapInitial(),
            [mapTrashBodyKey("t-1")]: EMPTY_V3,
          },
        });
        expect(readyView(result.current.view).trashStatus).toBe("ok");

        storage.setItem(MAP_TRASH_INDEX_KEY, "{corrupt");

        let emptied: ReturnType<typeof result.current.emptyTrash> | undefined;
        act(() => {
          emptied = result.current.emptyTrash();
        });

        expect(emptied).toEqual({
          ok: false,
          notice: trashCorruptNotice(),
        });
        expect(entries()[MAP_TRASH_INDEX_KEY]).toBe("{corrupt");
        expect(entries()[mapTrashBodyKey("t-1")]).toBe(EMPTY_V3);
        expect(readyView(result.current.view).trashStatus).toBe("corrupt");
        expect(readyView(result.current.view).trashEntries).toEqual([]);
      });
    });

    describe("refreshTrash と進行中ジャーナルガード", () => {
      it("refreshTrash は他タブの更新・期限切れ清掃・破損検知で view.trashEntries と view.trashStatus を同期する", () => {
        const { result, storage, operations } = setup({ initial: singleMapInitial() });
        // 既定の deletedAt + 30日 の expiresAt（2026-11-09）を使う
        const valid = trashEntry({ id: "t-valid" });
        const expired = trashEntry({ id: "t-expired", expiresAt: "2026-10-01T00:00:00.000Z" });
        storage.setItem(
          MAP_TRASH_INDEX_KEY,
          encodeMapTrashIndex({ version: 1, items: [valid, expired] }),
        );

        act(() => {
          result.current.refreshTrash();
        });
        expect(readyView(result.current.view).trashStatus).toBe("ok");
        expect(readyView(result.current.view).trashEntries).toEqual([valid]);

        storage.setItem(MAP_TRASH_INDEX_KEY, "{corrupt");
        act(() => {
          result.current.refreshTrash();
        });
        expect(readyView(result.current.view).trashStatus).toBe("corrupt");
        expect(readyView(result.current.view).trashEntries).toEqual([]);

        // 進行中ジャーナルがある場合は期限切れ清掃のための書き込みを行わない
        storage.setItem(
          MAP_TRASH_INDEX_KEY,
          encodeMapTrashIndex({ version: 1, items: [valid, expired] }),
        );
        storage.setItem(BRANCH_MOVE_JOURNAL_KEY, '{"pending":true}');
        const before = operations.length;
        act(() => {
          result.current.refreshTrash();
        });
        expect(operations.slice(before)).toEqual([]);
        expect(readyView(result.current.view).trashStatus).toBe("ok");
        expect(readyView(result.current.view).trashEntries).toEqual([expired, valid]);
      });

      it.each([
        ["BRANCH_MOVE_JOURNAL_KEY", BRANCH_MOVE_JOURNAL_KEY],
        ["LIBRARY_RESTORE_JOURNAL_KEY", LIBRARY_RESTORE_JOURNAL_KEY],
      ])("進行中ジャーナル %s があるときはゴミ箱操作と完全削除を拒否する", (_label, journalKey) => {
        const item = trashEntry({ id: "t-1" });
        const { result, storage } = setup({
          initial: {
            ...twoMapsInitial(),
            [MAP_TRASH_INDEX_KEY]: encodeMapTrashIndex({ version: 1, items: [item] }),
            [mapTrashBodyKey("t-1")]: EMPTY_V3,
          },
        });
        storage.setItem(journalKey, '{"pending":true}');

        act(() => {
          expect(result.current.deleteMap("map-2").ok).toBe(false);
          expect(result.current.permanentlyDeleteMap("map-2").ok).toBe(false);
          expect(result.current.restoreFromTrash("t-1").ok).toBe(false);
          expect(result.current.permanentlyDeleteFromTrash("t-1").ok).toBe(false);
          expect(result.current.emptyTrash().ok).toBe(false);
        });
      });
    });
  });

  describe("マップライブラリメタデータ統合（お気に入り・最近使用・フォルダー）", () => {
    describe("起動時のメタデータ読み込み", () => {
      it("通常起動で初期マップの lastOpenedAt を記録して保存し、libraryMetaStatus を ready にする", () => {
        const existingMeta: MapLibraryMetaV1 = {
          version: 1,
          folders: [{ id: "f-1", name: "仕事", createdAt: SEED_TIMESTAMP, updatedAt: SEED_TIMESTAMP }],
          mapMeta: {
            "map-1": { favorite: true, folderId: "f-1" },
          },
        };
        const { result, entries } = setup({
          initial: twoMapsInitial({
            [MAP_LIBRARY_META_STORAGE_KEY]: encodeMapLibraryMeta(existingMeta),
          }),
        });

        const view = readyView(result.current.view);
        expect(view.libraryMetaStatus).toBe("ready");
        expect(view.libraryMeta).toEqual({
          version: 1,
          folders: existingMeta.folders,
          mapMeta: {
            "map-1": { favorite: true, folderId: "f-1", lastOpenedAt: NOW },
          },
        });
        expect(storedLibraryMeta(entries())).toEqual(view.libraryMeta);
      });

      it("メタデータ破損時は通常モードで起動し libraryMetaStatus を corrupt にして破損データを自動上書きしない（L-002, L-669）", () => {
        const { result, entries, operations } = setup({
          initial: twoMapsInitial({
            [MAP_LIBRARY_META_STORAGE_KEY]: "{corrupt-meta",
          }),
        });

        const view = readyView(result.current.view);
        expect(view.storageMode).toBe("persistent");
        expect(view.libraryMetaStatus).toBe("corrupt");
        expect(view.libraryMeta).toEqual(createEmptyMapLibraryMeta());
        expect(view.startupNotice).toBeNull();
        expect(entries()[MAP_LIBRARY_META_STORAGE_KEY]).toBe("{corrupt-meta");
        expect(operations.some((op) => op.key === MAP_LIBRARY_META_STORAGE_KEY)).toBe(false);
      });

      it("メタデータ読込例外時は通常モードで起動し libraryMetaStatus を unavailable にして自動上書きしない（L-002, L-669）", () => {
        const recording = createRecordingStorage({
          initial: twoMapsInitial({
            [MAP_LIBRARY_META_STORAGE_KEY]: encodeMapLibraryMeta(createEmptyMapLibraryMeta()),
          }),
        });
        const originalGetItem = recording.storage.getItem.bind(recording.storage);
        recording.storage.getItem = (key: string) => {
          if (key === MAP_LIBRARY_META_STORAGE_KEY) {
            throw new DOMException("blocked", "SecurityError");
          }
          return originalGetItem(key);
        };
        const { result } = renderHook(() =>
          useMapLibrary({
            getStorage: () => recording.storage,
            now: () => new Date(NOW),
            generateId: idSequence(["gen-1"]),
          }),
        );

        const view = readyView(result.current.view);
        expect(view.storageMode).toBe("persistent");
        expect(view.libraryMetaStatus).toBe("unavailable");
        expect(view.libraryMeta).toEqual(createEmptyMapLibraryMeta());
        expect(recording.operations.some((op) => op.key === MAP_LIBRARY_META_STORAGE_KEY)).toBe(false);
      });

      it("保護モード時は libraryMetaStatus を unavailable にし、メタデータキーへ一切アクセスしない（L-002, L-061）", () => {
        const recording = createRecordingStorage({
          initial: {
            [MAP_STORAGE_KEY]: LEGACY_JSON,
            [MAP_LIBRARY_META_STORAGE_KEY]: "{should-not-read",
          },
          failSetItem: (key) => key === mapBodyKey("migrated"),
          failSetItemError: "SecurityError",
        });
        const getSpy = jest.spyOn(recording.storage, "getItem");
        const { result } = renderHook(() =>
          useMapLibrary({
            getStorage: () => recording.storage,
            now: () => new Date(NOW),
            generateId: idSequence(["migrated", "memory"]),
          }),
        );

        const view = readyView(result.current.view);
        expect(view.storageMode).toBe("protected");
        expect(view.libraryMetaStatus).toBe("unavailable");
        expect(view.libraryMeta).toEqual(createEmptyMapLibraryMeta());
        expect(getSpy).not.toHaveBeenCalledWith(MAP_LIBRARY_META_STORAGE_KEY);
        expect(recording.operations.some((op) => op.key === MAP_LIBRARY_META_STORAGE_KEY)).toBe(false);
      });

      it("起動時の lastOpenedAt 書込失敗時、既存 startupNotice が無ければ警告を出しメモリ状態を変えない（L-001）", () => {
        const { result } = setup({
          initial: twoMapsInitial(),
          failSetItem: (key) => key === MAP_LIBRARY_META_STORAGE_KEY,
        });

        const view = readyView(result.current.view);
        expect(view.storageMode).toBe("persistent");
        expect(view.libraryMetaStatus).toBe("ready");
        expect(view.libraryMeta.mapMeta["map-1"]).toBeUndefined();
        expect(view.startupNotice?.kind).toBe("warning");
      });

      it("起動時の lastOpenedAt 書込失敗時、既存の startupNotice がある場合は上書きしない", () => {
        const { result } = setup({
          initial: { [MAP_INDEX_STORAGE_KEY]: "{" },
          ids: ["rebuilt"],
          failSetItem: (key) => key === MAP_LIBRARY_META_STORAGE_KEY,
        });

        const view = readyView(result.current.view);
        expect(view.startupNotice).toEqual({
          kind: "warning",
          message: "マップの一覧を読み取れなかったため、空のマップで開始します。",
        });
      });
    });

    describe("メタデータ操作アクションと鮮度同期", () => {
      it("お気に入り切替・フォルダー作成/名前変更/割当/削除が保存とメモリ状態へ反映される", () => {
        const { result, entries } = setup({
          initial: twoMapsInitial(),
          ids: ["folder-1"],
        });

        let favOn: ReturnType<typeof result.current.toggleFavorite> | undefined;
        act(() => {
          favOn = result.current.toggleFavorite("map-2");
        });
        expect(favOn?.ok).toBe(true);
        expect(readyView(result.current.view).libraryMeta.mapMeta["map-2"]?.favorite).toBe(true);
        expect(storedLibraryMeta(entries()).mapMeta["map-2"]?.favorite).toBe(true);

        let created: ReturnType<typeof result.current.createFolder> | undefined;
        act(() => {
          created = result.current.createFolder("  仕事  ");
        });
        expect(created).toMatchObject({ ok: true, remounted: false, folderId: "folder-1" });
        expect(readyView(result.current.view).libraryMeta.folders).toEqual([
          { id: "folder-1", name: "仕事", createdAt: NOW, updatedAt: NOW },
        ]);

        let assigned: ReturnType<typeof result.current.assignFolder> | undefined;
        act(() => {
          assigned = result.current.assignFolder("map-2", "folder-1");
        });
        expect(assigned?.ok).toBe(true);
        expect(readyView(result.current.view).libraryMeta.mapMeta["map-2"]).toEqual({
          favorite: true,
          folderId: "folder-1",
        });

        let renamed: ReturnType<typeof result.current.renameFolder> | undefined;
        act(() => {
          renamed = result.current.renameFolder("folder-1", "業務");
        });
        expect(renamed?.ok).toBe(true);
        expect(readyView(result.current.view).libraryMeta.folders[0]?.name).toBe("業務");

        let deleted: ReturnType<typeof result.current.deleteFolder> | undefined;
        act(() => {
          deleted = result.current.deleteFolder("folder-1");
        });
        expect(deleted?.ok).toBe(true);
        expect(readyView(result.current.view).libraryMeta.folders).toEqual([]);
        expect(readyView(result.current.view).libraryMeta.mapMeta["map-2"]).toEqual({
          favorite: true,
        });
        expect(readyView(result.current.view).maps.map((m) => m.id)).toContain("map-2");

        let favOff: ReturnType<typeof result.current.toggleFavorite> | undefined;
        act(() => {
          favOff = result.current.toggleFavorite("map-2");
        });
        expect(favOff?.ok).toBe(true);
        expect(readyView(result.current.view).libraryMeta.mapMeta["map-2"]).toBeUndefined();
      });

      it("メタデータ書込失敗時はメモリ状態を変更せず ok: false を返す（L-001）", () => {
        let failMetaWrite = false;
        const { result } = setup({
          initial: twoMapsInitial(),
          ids: ["folder-1"],
          failSetItem: (key) => failMetaWrite && key === MAP_LIBRARY_META_STORAGE_KEY,
        });
        act(() => {
          expect(result.current.createFolder("仕事").ok).toBe(true);
        });
        const viewBefore = result.current.view;
        failMetaWrite = true;

        act(() => {
          expect(result.current.toggleFavorite("map-1").ok).toBe(false);
          expect(result.current.assignFolder("map-1", "folder-1").ok).toBe(false);
          expect(result.current.createFolder("個人").ok).toBe(false);
          expect(result.current.renameFolder("folder-1", "変更後").ok).toBe(false);
          expect(result.current.deleteFolder("folder-1").ok).toBe(false);
        });

        expect(result.current.view).toBe(viewBefore);
      });

      it("保護モード・corrupt・unavailable 時はメタ書込操作をすべて拒否する（L-061）", () => {
        // corrupt
        const corrupt = setup({
          initial: twoMapsInitial({ [MAP_LIBRARY_META_STORAGE_KEY]: "{corrupt" }),
        });
        const corruptBefore = corrupt.operations.length;
        act(() => {
          expect(corrupt.result.current.toggleFavorite("map-1").ok).toBe(false);
          expect(corrupt.result.current.assignFolder("map-1", null).ok).toBe(false);
          expect(corrupt.result.current.createFolder("仕事").ok).toBe(false);
          expect(corrupt.result.current.renameFolder("f-1", "業務").ok).toBe(false);
          expect(corrupt.result.current.deleteFolder("f-1").ok).toBe(false);
        });
        expect(corrupt.operations.slice(corruptBefore)).toEqual([]);
        expect(corrupt.entries()[MAP_LIBRARY_META_STORAGE_KEY]).toBe("{corrupt");

        // unavailable
        const unavailableRecording = createRecordingStorage({ initial: twoMapsInitial() });
        const unavailableOrigGet = unavailableRecording.storage.getItem.bind(unavailableRecording.storage);
        unavailableRecording.storage.getItem = (key: string) => {
          if (key === MAP_LIBRARY_META_STORAGE_KEY) {
            throw new DOMException("blocked", "SecurityError");
          }
          return unavailableOrigGet(key);
        };
        const unavailableHook = renderHook(() =>
          useMapLibrary({
            getStorage: () => unavailableRecording.storage,
            now: () => new Date(NOW),
            generateId: idSequence(["gen-1"]),
          }),
        );
        const unavailableBefore = unavailableRecording.operations.length;
        act(() => {
          expect(unavailableHook.result.current.toggleFavorite("map-1").ok).toBe(false);
          expect(unavailableHook.result.current.assignFolder("map-1", null).ok).toBe(false);
          expect(unavailableHook.result.current.createFolder("仕事").ok).toBe(false);
          expect(unavailableHook.result.current.renameFolder("f-1", "業務").ok).toBe(false);
          expect(unavailableHook.result.current.deleteFolder("f-1").ok).toBe(false);
          expect(unavailableHook.result.current.resetLibraryMeta().ok).toBe(false);
        });
        expect(unavailableRecording.operations.slice(unavailableBefore)).toEqual([]);

        // protected
        const protectedHook = renderHook(() =>
          useMapLibrary({
            getStorage: () => null,
            now: () => new Date(NOW),
            generateId: idSequence(["memory"]),
          }),
        );
        act(() => {
          expect(protectedHook.result.current.toggleFavorite("memory").ok).toBe(false);
          expect(protectedHook.result.current.assignFolder("memory", null).ok).toBe(false);
          expect(protectedHook.result.current.createFolder("仕事").ok).toBe(false);
          expect(protectedHook.result.current.renameFolder("f-1", "業務").ok).toBe(false);
          expect(protectedHook.result.current.deleteFolder("f-1").ok).toBe(false);
          expect(protectedHook.result.current.resetLibraryMeta().ok).toBe(false);
        });
      });

      it("お気に入り・フォルダーを持つマップをゴミ箱へ移して戻すと、マップは戻るがお気に入り・フォルダーの所属は外れたまま（メタはアクティブなマップだけが対象・設計どおり）", () => {
        const { result, entries } = setup({
          initial: twoMapsInitial({ [mapBodyKey("map-2")]: EMPTY_V3 }),
          ids: ["folder-1"],
        });
        act(() => {
          expect(result.current.createFolder("仕事").ok).toBe(true);
          expect(result.current.assignFolder("map-2", "folder-1").ok).toBe(true);
          expect(result.current.toggleFavorite("map-2").ok).toBe(true);
        });
        expect(readyView(result.current.view).libraryMeta.mapMeta["map-2"]).toMatchObject({
          favorite: true,
          folderId: "folder-1",
        });

        act(() => {
          expect(result.current.deleteMap("map-2").ok).toBe(true);
        });
        expect(readyView(result.current.view).libraryMeta.mapMeta["map-2"]).toBeUndefined();
        const trashId = readyView(result.current.view).trashEntries.find(
          (item) => item.originalMapId === "map-2",
        )?.id;
        expect(trashId).toBeDefined();

        act(() => {
          expect(result.current.restoreFromTrash(trashId!).ok).toBe(true);
        });

        const view = readyView(result.current.view);
        expect(view.maps.map((map) => map.id)).toContain("map-2");
        expect(view.libraryMeta.mapMeta["map-2"]).toBeUndefined();
        expect(storedLibraryMeta(entries()).mapMeta["map-2"]).toBeUndefined();
        // フォルダー自体は残る（中のマップが無くなるだけ）
        expect(view.libraryMeta.folders.map((folder) => folder.id)).toEqual(["folder-1"]);
      });

      it("assignFolder の未分類戻し・同一値スキップ・renameFolder 同一名スキップ・不正 ID/重複名を検証する", () => {
        const { result, operations } = setup({
          initial: twoMapsInitial(),
          ids: ["folder-1", "folder-2"],
        });

        act(() => {
          expect(result.current.createFolder("仕事").ok).toBe(true);
          expect(result.current.assignFolder("map-2", "folder-1").ok).toBe(true);
        });

        const beforeUnchanged = operations.length;
        let sameAssign: ReturnType<typeof result.current.assignFolder> | undefined;
        let sameRename: ReturnType<typeof result.current.renameFolder> | undefined;
        act(() => {
          sameAssign = result.current.assignFolder("map-2", "folder-1");
          sameRename = result.current.renameFolder("folder-1", "  仕事  ");
        });
        expect(sameAssign).toEqual({ ok: true, remounted: false, notice: null, saveRetryNotice: null });
        expect(sameRename).toEqual({ ok: true, remounted: false, notice: null, saveRetryNotice: null });
        expect(operations.slice(beforeUnchanged)).toEqual([]);

        // 未分類へ戻す
        act(() => {
          expect(result.current.assignFolder("map-2", null).ok).toBe(true);
        });
        expect(readyView(result.current.view).libraryMeta.mapMeta["map-2"]).toBeUndefined();

        // 不正入力・存在しない ID・重複名は書き込まず拒否する
        const beforeInvalid = operations.length;
        act(() => {
          expect(result.current.toggleFavorite("missing").ok).toBe(false);
          expect(result.current.assignFolder("missing", "folder-1").ok).toBe(false);
          expect(result.current.assignFolder("map-2", "missing-folder").ok).toBe(false);
          expect(result.current.createFolder("仕事").ok).toBe(false);
          expect(result.current.renameFolder("missing-folder", "別名").ok).toBe(false);
          expect(result.current.deleteFolder("missing-folder").ok).toBe(false);
        });
        expect(operations.slice(beforeInvalid)).toEqual([]);
      });

      it("resetLibraryMeta は corrupt 時のみ初期化を許可し、ready / unavailable では拒否する（L-669）", () => {
        const readyHook = setup({ initial: twoMapsInitial() });
        const readyBefore = readyHook.operations.length;
        act(() => {
          expect(readyHook.result.current.resetLibraryMeta().ok).toBe(false);
        });
        expect(readyHook.operations.slice(readyBefore)).toEqual([]);

        const recording = createRecordingStorage({ initial: twoMapsInitial() });
        const origGet = recording.storage.getItem.bind(recording.storage);
        recording.storage.getItem = (key: string) => {
          if (key === MAP_LIBRARY_META_STORAGE_KEY) throw new DOMException("blocked", "SecurityError");
          return origGet(key);
        };
        const unavailableHook = renderHook(() =>
          useMapLibrary({
            getStorage: () => recording.storage,
            now: () => new Date(NOW),
            generateId: idSequence(["gen-1"]),
          }),
        );
        act(() => {
          expect(unavailableHook.result.current.resetLibraryMeta().ok).toBe(false);
        });
        expect(recording.operations.some((op) => op.key === MAP_LIBRARY_META_STORAGE_KEY)).toBe(false);

        let failReset = true;
        const corruptHook = setup({
          initial: twoMapsInitial({ [MAP_LIBRARY_META_STORAGE_KEY]: "{corrupt" }),
          failSetItem: (key) => failReset && key === MAP_LIBRARY_META_STORAGE_KEY,
        });
        act(() => {
          expect(corruptHook.result.current.resetLibraryMeta().ok).toBe(false);
        });
        expect(readyView(corruptHook.result.current.view).libraryMetaStatus).toBe("corrupt");

        failReset = false;
        act(() => {
          expect(corruptHook.result.current.resetLibraryMeta().ok).toBe(true);
        });
        const recovered = readyView(corruptHook.result.current.view);
        expect(recovered.libraryMetaStatus).toBe("ready");
        expect(recovered.libraryMeta).toEqual(createEmptyMapLibraryMeta());
        expect(storedLibraryMeta(corruptHook.entries())).toEqual(createEmptyMapLibraryMeta());
      });

      it("メタデータ変更で revisionRef が進み、古いバックアップ・復元プレビューを無効化する（L-036）", async () => {
        const backupJson = JSON.stringify({
          format: "draw-my-map-library-backup",
          version: 1,
          exportedAt: NOW,
          currentMapId: "source",
          maps: [
            {
              id: "source",
              name: "移行元",
              createdAt: SEED_TIMESTAMP,
              updatedAt: SEED_TIMESTAMP,
              document: JSON.parse(EMPTY_V3),
            },
          ],
        });
        const { result } = setup({ initial: singleMapInitial() });
        readyView(result.current.view).storageSession.registerBackupSnapshot(() => ({
          json: EMPTY_V3,
          hydrated: true,
          restoreOrigin: "restored",
          hasSavedBodyThisMount: false,
        }));
        const prepared = result.current.prepareBackup();
        expect(prepared.ok).toBe(true);
        if (!prepared.ok) return;
        const restorePreview = await result.current.previewRestore(
          backupFile(async () => backupJson),
        );
        expect(restorePreview.ok).toBe(true);
        if (!restorePreview.ok) return;

        act(() => {
          expect(result.current.toggleFavorite("only").ok).toBe(true);
        });

        expect(result.current.downloadBackup(prepared.value).ok).toBe(false);
        expect(result.current.confirmRestore(restorePreview.value).ok).toBe(false);
      });

      it("prepareBackup は libraryMeta と libraryMetaStatus を prepareLibraryBackup へ渡す（corrupt 時はメタ抜き）", () => {
        const { result } = setup({
          initial: singleMapInitial(),
          ids: ["folder-1"],
        });
        readyView(result.current.view).storageSession.registerBackupSnapshot(() => ({
          json: EMPTY_V3,
          hydrated: true,
          restoreOrigin: "restored",
          hasSavedBodyThisMount: false,
        }));
        act(() => {
          expect(result.current.createFolder("仕事").ok).toBe(true);
          expect(result.current.assignFolder("only", "folder-1").ok).toBe(true);
          expect(result.current.toggleFavorite("only").ok).toBe(true);
        });

        const prepared = result.current.prepareBackup();
        expect(prepared.ok).toBe(true);
        if (!prepared.ok) return;
        const parsed = parseLibraryBackupJson(prepared.value.json);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.value.folders).toEqual([
          { id: "folder-1", name: "仕事", createdAt: NOW, updatedAt: NOW },
        ]);
        expect(parsed.value.mapMeta).toEqual({
          only: { favorite: true, lastOpenedAt: NOW, folderId: "folder-1" },
        });

        const corrupt = setup({
          initial: singleMapInitial({ [MAP_LIBRARY_META_STORAGE_KEY]: "{corrupt" }),
        });
        readyView(corrupt.result.current.view).storageSession.registerBackupSnapshot(() => ({
          json: EMPTY_V3,
          hydrated: true,
          restoreOrigin: "restored",
          hasSavedBodyThisMount: false,
        }));
        const corruptPrepared = corrupt.result.current.prepareBackup();
        expect(corruptPrepared.ok).toBe(true);
        if (!corruptPrepared.ok) return;
        const corruptParsed = JSON.parse(corruptPrepared.value.json) as Record<string, unknown>;
        expect("folders" in corruptParsed).toBe(false);
        expect("mapMeta" in corruptParsed).toBe(false);
      });
    });

    describe("既存マップ操作とのメタデータ連動", () => {
      it("switchMap 成功時は遷移先 sessionNumber を返し、遷移先の lastOpenedAt を更新する", () => {
        let currentTime = "2026-10-21T03:04:05.000Z";
        const { result, entries } = setup({
          initial: twoMapsInitial(),
          now: () => new Date(currentTime),
        });
        const initialSessionNumber = readyView(result.current.view).storageSession.sessionNumber;

        currentTime = "2026-10-21T04:00:00.000Z";
        let switched: ReturnType<typeof result.current.switchMap> | undefined;
        act(() => {
          switched = result.current.switchMap("map-2");
        });

        const view = readyView(result.current.view);
        expect(switched).toMatchObject({
          ok: true,
          remounted: true,
          sessionNumber: view.storageSession.sessionNumber,
        });
        expect(view.storageSession.sessionNumber).toBeGreaterThan(initialSessionNumber);
        expect(view.libraryMeta.mapMeta["map-2"]?.lastOpenedAt).toBe(currentTime);
        expect(storedLibraryMeta(entries()).mapMeta["map-2"]?.lastOpenedAt).toBe(currentTime);
      });

      it("createMap / saveCurrentAsNewMap / moveBranchToMap 成功時に新・移動先マップの lastOpenedAt を更新する", () => {
        const bodyWithBranch = JSON.stringify({
          version: 3,
          layoutMode: "manual",
          nodes: [
            { id: 1, parentId: null, x: 0, y: 0, width: 100, height: 60, label: "親", importance: "medium" },
            { id: 2, parentId: 1, x: 100, y: 0, width: 100, height: 60, label: "子", importance: "medium" },
          ],
        });
        const { result, entries } = setup({
          initial: {
            ...twoMapsInitial(),
            [mapBodyKey("map-1")]: bodyWithBranch,
            [mapBodyKey("map-2")]: EMPTY_V3,
          },
          ids: ["created-1", "saved-as-1"],
        });

        act(() => {
          expect(result.current.createMap("新規").ok).toBe(true);
        });
        expect(readyView(result.current.view).libraryMeta.mapMeta["created-1"]?.lastOpenedAt).toBe(NOW);

        act(() => {
          expect(result.current.saveCurrentAsNewMap("別名保存", EMPTY_V3).ok).toBe(true);
        });
        expect(readyView(result.current.view).libraryMeta.mapMeta["saved-as-1"]?.lastOpenedAt).toBe(NOW);

        act(() => {
          expect(result.current.switchMap("map-1").ok).toBe(true);
        });
        const session = readyView(result.current.view).storageSession;
        act(() => {
          expect(result.current.moveBranchToMap(session, "map-2", 2).ok).toBe(true);
        });
        expect(readyView(result.current.view).libraryMeta.mapMeta["map-2"]?.lastOpenedAt).toBe(NOW);
        expect(storedLibraryMeta(entries()).mapMeta["map-2"]?.lastOpenedAt).toBe(NOW);
      });

      it("corrupt 状態のときは switchMap / createMap / saveCurrentAsNewMap / moveBranchToMap / deleteMap でもメタデータを自動上書きしない（L-669）", () => {
        const bodyWithBranch = JSON.stringify({
          version: 3,
          layoutMode: "manual",
          nodes: [
            { id: 1, parentId: null, x: 0, y: 0, width: 100, height: 60, label: "親", importance: "medium" },
            { id: 2, parentId: 1, x: 100, y: 0, width: 100, height: 60, label: "子", importance: "medium" },
          ],
        });
        const { result, entries, operations } = setup({
          initial: {
            ...twoMapsInitial({ [MAP_LIBRARY_META_STORAGE_KEY]: "{corrupt" }),
            [mapBodyKey("map-1")]: bodyWithBranch,
            [mapBodyKey("map-2")]: EMPTY_V3,
          },
          ids: ["created-1", "saved-1"],
        });

        const session = readyView(result.current.view).storageSession;
        act(() => {
          expect(result.current.moveBranchToMap(session, "map-2", 2).ok).toBe(true);
          expect(result.current.switchMap("map-1").ok).toBe(true);
          expect(result.current.createMap("新規").ok).toBe(true);
          expect(result.current.saveCurrentAsNewMap("別名", EMPTY_V3).ok).toBe(true);
          expect(result.current.deleteMap("saved-1").ok).toBe(true);
        });

        expect(entries()[MAP_LIBRARY_META_STORAGE_KEY]).toBe("{corrupt");
        expect(operations.some((op) => op.key === MAP_LIBRARY_META_STORAGE_KEY)).toBe(false);
      });

      it("switchMap / createMap / saveCurrentAsNewMap / moveBranchToMap / deleteMap で主処理後のメタ書込が失敗しても主処理を巻き戻さず警告通知のみ返す（L-001, L-575）", () => {
        const bodyWithBranch = JSON.stringify({
          version: 3,
          layoutMode: "manual",
          nodes: [
            { id: 1, parentId: null, x: 0, y: 0, width: 100, height: 60, label: "親", importance: "medium" },
            { id: 2, parentId: 1, x: 100, y: 0, width: 100, height: 60, label: "子", importance: "medium" },
          ],
        });
        let failMeta = false;
        const { result } = setup({
          initial: {
            ...twoMapsInitial(),
            [mapBodyKey("map-1")]: bodyWithBranch,
            [mapBodyKey("map-2")]: EMPTY_V3,
          },
          ids: ["created-1", "saved-1"],
          failSetItem: (key) => failMeta && key === MAP_LIBRARY_META_STORAGE_KEY,
        });
        failMeta = true;

        const initialSession = readyView(result.current.view).storageSession;
        let moved: ReturnType<typeof result.current.moveBranchToMap> | undefined;
        act(() => {
          moved = result.current.moveBranchToMap(initialSession, "map-2", 2);
        });
        expect(moved?.ok).toBe(true);
        if (moved?.ok) expect(moved.notice?.kind).toBe("warning");
        expect(readyView(result.current.view).currentMap.id).toBe("map-2");
        expect(readyView(result.current.view).libraryMeta.mapMeta["map-2"]).toBeUndefined();

        let switched: ReturnType<typeof result.current.switchMap> | undefined;
        act(() => {
          switched = result.current.switchMap("map-1");
        });
        expect(switched?.ok).toBe(true);
        if (switched?.ok) {
          expect(switched.notice?.kind).toBe("warning");
          expect(switched.sessionNumber).toBe(readyView(result.current.view).storageSession.sessionNumber);
        }
        expect(readyView(result.current.view).currentMap.id).toBe("map-1");

        let created: ReturnType<typeof result.current.createMap> | undefined;
        act(() => {
          created = result.current.createMap("新規");
        });
        expect(created?.ok).toBe(true);
        if (created?.ok) expect(created.notice?.kind).toBe("warning");
        expect(readyView(result.current.view).currentMap.id).toBe("created-1");
        expect(readyView(result.current.view).libraryMeta.mapMeta["created-1"]).toBeUndefined();

        let savedAs: ReturnType<typeof result.current.saveCurrentAsNewMap> | undefined;
        act(() => {
          savedAs = result.current.saveCurrentAsNewMap("別名保存", EMPTY_V3);
        });
        expect(savedAs?.ok).toBe(true);
        if (savedAs?.ok) expect(savedAs.notice?.kind).toBe("warning");
        expect(readyView(result.current.view).currentMap.id).toBe("saved-1");
        expect(readyView(result.current.view).libraryMeta.mapMeta["saved-1"]).toBeUndefined();

        let deleted: ReturnType<typeof result.current.deleteMap> | undefined;
        act(() => {
          deleted = result.current.deleteMap("saved-1");
        });
        expect(deleted?.ok).toBe(true);
        if (deleted?.ok) expect(deleted.notice?.kind).toBe("warning");
        expect(readyView(result.current.view).currentMap.id).not.toBe("saved-1");
      });

      it("現在マップ削除時は prune と次マップの recordMapOpened を合成して 1 回だけ書き込む（L-453, L-537）", () => {
        const { result, operations, entries } = setup({
          initial: threeMapsInitial(),
          ids: ["folder-1"],
        });
        act(() => {
          expect(result.current.createFolder("仕事").ok).toBe(true);
          expect(result.current.assignFolder("map-a", "folder-1").ok).toBe(true);
          expect(result.current.toggleFavorite("map-a").ok).toBe(true);
        });
        const before = operations.length;

        act(() => {
          expect(result.current.deleteMap("map-a").ok).toBe(true);
        });

        const metaWrites = operations
          .slice(before)
          .filter((op) => op.type === "setItem" && op.key === MAP_LIBRARY_META_STORAGE_KEY);
        expect(metaWrites).toHaveLength(1);
        const view = readyView(result.current.view);
        expect(view.currentMap.id).toBe("map-b");
        expect(view.libraryMeta.mapMeta["map-a"]).toBeUndefined();
        expect(view.libraryMeta.mapMeta["map-b"]?.lastOpenedAt).toBe(NOW);
        expect(storedLibraryMeta(entries())).toEqual(view.libraryMeta);
      });

      it("最後の 1 件の完全削除でも prune と新規マップの recordMapOpened を 1 回だけ書き込む（L-453, L-537）", () => {
        const { result, operations, entries } = setup({
          initial: singleMapInitial(),
          ids: ["fresh-1"],
        });
        act(() => {
          expect(result.current.toggleFavorite("only").ok).toBe(true);
        });
        const before = operations.length;

        act(() => {
          expect(result.current.permanentlyDeleteMap("only").ok).toBe(true);
        });

        const metaWrites = operations
          .slice(before)
          .filter((op) => op.type === "setItem" && op.key === MAP_LIBRARY_META_STORAGE_KEY);
        expect(metaWrites).toHaveLength(1);
        const view = readyView(result.current.view);
        expect(view.currentMap.id).toBe("fresh-1");
        expect(view.libraryMeta.mapMeta["only"]).toBeUndefined();
        expect(view.libraryMeta.mapMeta["fresh-1"]?.lastOpenedAt).toBe(NOW);
        expect(storedLibraryMeta(entries())).toEqual(view.libraryMeta);
      });

      it("非現在マップ削除時、対象にメタデータがあれば 1 回だけ prune を書き込む", () => {
        const { result, operations, entries } = setup({
          initial: threeMapsInitial(),
        });
        act(() => {
          expect(result.current.toggleFavorite("map-b").ok).toBe(true);
        });
        const before = operations.length;

        act(() => {
          expect(result.current.deleteMap("map-b").ok).toBe(true);
        });

        const metaWrites = operations
          .slice(before)
          .filter((op) => op.type === "setItem" && op.key === MAP_LIBRARY_META_STORAGE_KEY);
        expect(metaWrites).toHaveLength(1);
        expect(readyView(result.current.view).libraryMeta.mapMeta["map-b"]).toBeUndefined();
        expect(storedLibraryMeta(entries()).mapMeta["map-b"]).toBeUndefined();
      });
    });

    describe("一括復元後のメタデータマージ", () => {
      it("メタデータ付きバックアップ復元後、ID 付け替えとフォルダー合流を 1 回だけ保存する", async () => {
        const backupWithMeta = JSON.stringify({
          format: "draw-my-map-library-backup",
          version: 1,
          exportedAt: NOW,
          currentMapId: "source",
          maps: [
            {
              id: "source",
              name: "移行元",
              createdAt: SEED_TIMESTAMP,
              updatedAt: SEED_TIMESTAMP,
              document: JSON.parse(EMPTY_V3),
            },
          ],
          folders: [
            { id: "bf-shared", name: "仕事", createdAt: SEED_TIMESTAMP, updatedAt: SEED_TIMESTAMP },
            { id: "bf-new", name: "新規フォルダー", createdAt: SEED_TIMESTAMP, updatedAt: SEED_TIMESTAMP },
          ],
          mapMeta: {
            source: { favorite: true, lastOpenedAt: SEED_TIMESTAMP, folderId: "bf-shared" },
          },
        });
        const { result, operations, entries } = setup({
          initial: singleMapInitial({
            [MAP_LIBRARY_META_STORAGE_KEY]: encodeMapLibraryMeta({
              version: 1,
              folders: [{ id: "existing-f", name: "仕事", createdAt: SEED_TIMESTAMP, updatedAt: SEED_TIMESTAMP }],
              mapMeta: {},
            }),
          }),
          ids: ["restored-map-1"],
        });
        readyView(result.current.view).storageSession.registerBackupSnapshot(() => ({
          json: EMPTY_V3,
          hydrated: true,
          restoreOrigin: "restored",
          hasSavedBodyThisMount: false,
        }));
        const preview = await result.current.previewRestore(backupFile(async () => backupWithMeta));
        expect(preview.ok).toBe(true);
        if (!preview.ok) return;
        const before = operations.length;

        let outcome: ReturnType<typeof result.current.confirmRestore> | undefined;
        act(() => {
          outcome = result.current.confirmRestore(preview.value);
        });

        expect(outcome).toMatchObject({ ok: true, remounted: false });
        expect(outcome?.notice?.kind).toBe("status");
        const metaWrites = operations
          .slice(before)
          .filter((op) => op.type === "setItem" && op.key === MAP_LIBRARY_META_STORAGE_KEY);
        expect(metaWrites).toHaveLength(1);
        const view = readyView(result.current.view);
        expect(view.libraryMeta.folders.map((f) => f.name)).toEqual(["仕事", "新規フォルダー"]);
        expect(view.libraryMeta.mapMeta["restored-map-1"]).toEqual({
          favorite: true,
          lastOpenedAt: SEED_TIMESTAMP,
          folderId: "existing-f",
        });
        expect(storedLibraryMeta(entries())).toEqual(view.libraryMeta);
      });

      it("復元時のフォルダー上限超過（droppedFolderCount > 0）はマップ復元を巻き戻さず警告通知を出す（L-575）", async () => {
        const existingFolders = Array.from({ length: MAX_MAP_FOLDERS }, (_, i) => ({
          id: `ef-${i}`,
          name: `既存${i}`,
          createdAt: SEED_TIMESTAMP,
          updatedAt: SEED_TIMESTAMP,
        }));
        const backupOverflow = JSON.stringify({
          format: "draw-my-map-library-backup",
          version: 1,
          exportedAt: NOW,
          currentMapId: "source",
          maps: [
            {
              id: "source",
              name: "移行元",
              createdAt: SEED_TIMESTAMP,
              updatedAt: SEED_TIMESTAMP,
              document: JSON.parse(EMPTY_V3),
            },
          ],
          folders: [
            { id: "bf-overflow", name: "あふれるフォルダー", createdAt: SEED_TIMESTAMP, updatedAt: SEED_TIMESTAMP },
          ],
          mapMeta: {
            source: { favorite: true, folderId: "bf-overflow" },
          },
        });
        const { result, entries } = setup({
          initial: singleMapInitial({
            [MAP_LIBRARY_META_STORAGE_KEY]: encodeMapLibraryMeta({
              version: 1,
              folders: existingFolders,
              mapMeta: {},
            }),
          }),
          ids: ["restored-map-1"],
        });
        readyView(result.current.view).storageSession.registerBackupSnapshot(() => ({
          json: EMPTY_V3,
          hydrated: true,
          restoreOrigin: "restored",
          hasSavedBodyThisMount: false,
        }));
        const preview = await result.current.previewRestore(backupFile(async () => backupOverflow));
        expect(preview.ok).toBe(true);
        if (!preview.ok) return;

        let outcome: ReturnType<typeof result.current.confirmRestore> | undefined;
        act(() => {
          outcome = result.current.confirmRestore(preview.value);
        });

        expect(outcome?.ok).toBe(true);
        expect(outcome?.notice?.kind).toBe("warning");
        expect(storedIndex(entries()).maps.map((m) => m.id)).toContain("restored-map-1");
        const view = readyView(result.current.view);
        expect(view.libraryMeta.folders).toHaveLength(MAX_MAP_FOLDERS);
        expect(view.libraryMeta.mapMeta["restored-map-1"]).toEqual({ favorite: true });
      });

      it("復元後のメタ書込失敗時はマップ復元を巻き戻さず警告通知を出しメモリ上のメタは維持する（L-001, L-575）", async () => {
        const backupWithMeta = JSON.stringify({
          format: "draw-my-map-library-backup",
          version: 1,
          exportedAt: NOW,
          currentMapId: "source",
          maps: [
            {
              id: "source",
              name: "移行元",
              createdAt: SEED_TIMESTAMP,
              updatedAt: SEED_TIMESTAMP,
              document: JSON.parse(EMPTY_V3),
            },
          ],
          folders: [
            { id: "bf-1", name: "仕事", createdAt: SEED_TIMESTAMP, updatedAt: SEED_TIMESTAMP },
          ],
          mapMeta: {
            source: { favorite: true, folderId: "bf-1" },
          },
        });
        let failMetaWrite = false;
        const { result, entries } = setup({
          initial: singleMapInitial(),
          ids: ["restored-map-1"],
          failSetItem: (key) => failMetaWrite && key === MAP_LIBRARY_META_STORAGE_KEY,
        });
        readyView(result.current.view).storageSession.registerBackupSnapshot(() => ({
          json: EMPTY_V3,
          hydrated: true,
          restoreOrigin: "restored",
          hasSavedBodyThisMount: false,
        }));
        const preview = await result.current.previewRestore(backupFile(async () => backupWithMeta));
        expect(preview.ok).toBe(true);
        if (!preview.ok) return;
        failMetaWrite = true;

        let outcome: ReturnType<typeof result.current.confirmRestore> | undefined;
        act(() => {
          outcome = result.current.confirmRestore(preview.value);
        });

        expect(outcome?.ok).toBe(true);
        expect(outcome?.notice?.kind).toBe("warning");
        expect(storedIndex(entries()).maps.map((m) => m.id)).toContain("restored-map-1");
        expect(readyView(result.current.view).libraryMeta.folders).toEqual([]);
        expect(readyView(result.current.view).libraryMeta.mapMeta["restored-map-1"]).toBeUndefined();
      });

      const RESTORE_META_SKIPPED_MESSAGES = {
        corrupt:
          "バックアップのマップを追加しましたが、お気に入り・フォルダー情報が破損しているため、バックアップのお気に入り・フォルダーは復元していません。",
        unavailable:
          "バックアップのマップを追加しましたが、お気に入り・フォルダー情報を読み込めなかったため、バックアップのお気に入り・フォルダーは復元していません。",
      } as const;

      function backupJsonForMetaStatus(withMeta: boolean): string {
        return JSON.stringify({
          format: "draw-my-map-library-backup",
          version: 1,
          exportedAt: NOW,
          currentMapId: "source",
          maps: [
            {
              id: "source",
              name: "移行元",
              createdAt: SEED_TIMESTAMP,
              updatedAt: SEED_TIMESTAMP,
              document: JSON.parse(EMPTY_V3),
            },
          ],
          ...(withMeta
            ? {
                folders: [
                  { id: "bf-1", name: "仕事", createdAt: SEED_TIMESTAMP, updatedAt: SEED_TIMESTAMP },
                ],
                mapMeta: {
                  source: { favorite: true, folderId: "bf-1" },
                },
              }
            : {}),
        });
      }

      function setupForMetaStatus(status: "corrupt" | "unavailable") {
        return setup({
          initial: singleMapInitial(
            status === "corrupt"
              ? { [MAP_LIBRARY_META_STORAGE_KEY]: "{corrupt" }
              : { [MAP_LIBRARY_META_STORAGE_KEY]: encodeMapLibraryMeta(createEmptyMapLibraryMeta()) },
          ),
          ids: ["restored-map-1"],
          throwOnGetItem: status === "unavailable" ? (key) => key === MAP_LIBRARY_META_STORAGE_KEY : undefined,
        });
      }

      async function confirmRestoreFor(
        view: ReturnType<typeof setupForMetaStatus>,
        backupJson: string,
      ) {
        readyView(view.result.current.view).storageSession.registerBackupSnapshot(() => ({
          json: EMPTY_V3,
          hydrated: true,
          restoreOrigin: "restored",
          hasSavedBodyThisMount: false,
        }));
        const preview = await view.result.current.previewRestore(backupFile(async () => backupJson));
        expect(preview.ok).toBe(true);
        if (!preview.ok) throw new Error("preview failed");
        let outcome: ReturnType<typeof view.result.current.confirmRestore> | undefined;
        act(() => {
          outcome = view.result.current.confirmRestore(preview.value);
        });
        return outcome;
      }

      it.each(["corrupt", "unavailable"] as const)(
        "libraryMetaStatus が %s のときはメタ付きバックアップ復元でもメタを上書きせず、お気に入り・フォルダーを復元しなかったことを warning で伝える（L-001, L-669）",
        async (status) => {
          const view = setupForMetaStatus(status);
          const metaBefore = view.entries()[MAP_LIBRARY_META_STORAGE_KEY];

          const outcome = await confirmRestoreFor(view, backupJsonForMetaStatus(true));

          expect(outcome?.ok).toBe(true);
          expect(outcome?.notice).toEqual({ kind: "warning", message: RESTORE_META_SKIPPED_MESSAGES[status] });
          expect(storedIndex(view.entries()).maps.map((m) => m.id)).toContain("restored-map-1");
          expect(view.entries()[MAP_LIBRARY_META_STORAGE_KEY]).toBe(metaBefore);
          expect(readyView(view.result.current.view).libraryMetaStatus).toBe(status);
        },
      );

      it.each(["corrupt", "unavailable"] as const)(
        "libraryMetaStatus が %s でも、メタデータの無いバックアップの復元は通常の成功通知のまま",
        async (status) => {
          const view = setupForMetaStatus(status);

          const outcome = await confirmRestoreFor(view, backupJsonForMetaStatus(false));

          expect(outcome?.ok).toBe(true);
          expect(outcome?.notice).toEqual({ kind: "status", message: "バックアップのマップを追加しました。" });
        },
      );
    });
  });
});

describe("useMapLibrary のメタデータの複数タブ（別タブの更新を次の書き込みで消さない）", () => {
  const OTHER_TAB_FOLDER = {
    id: "other-folder",
    name: "別タブのフォルダー",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  };

  // 別タブの書き込みを模す。ストレージ上の最新を読み、変更を当てて書き戻す（こちらのタブのメモリは古いまま）
  function writeFromOtherTab(
    storage: Storage,
    entries: () => Record<string, string>,
    update: (meta: MapLibraryMetaV1) => MapLibraryMetaV1,
  ) {
    storage.setItem(MAP_LIBRARY_META_STORAGE_KEY, encodeMapLibraryMeta(update(storedLibraryMeta(entries()))));
  }

  function favoriteMap2FromOtherTab(meta: MapLibraryMetaV1): MapLibraryMetaV1 {
    return { ...meta, mapMeta: { ...meta.mapMeta, "map-2": { ...meta.mapMeta["map-2"], favorite: true } } };
  }

  function folderWithMap2FromOtherTab(meta: MapLibraryMetaV1): MapLibraryMetaV1 {
    return {
      ...meta,
      folders: [...meta.folders, OTHER_TAB_FOLDER],
      mapMeta: { ...meta.mapMeta, "map-2": { ...meta.mapMeta["map-2"], folderId: OTHER_TAB_FOLDER.id } },
    };
  }

  function threeMapsWithBodies(): Record<string, string> {
    const index: MapIndexV1 = {
      version: 1,
      currentMapId: "map-1",
      maps: [entry("map-1", "マップ 1"), entry("map-2", "マップ 2"), entry("map-3", "マップ 3")],
      legacyCleanupPending: false,
    };
    return {
      [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
      [mapBodyKey("map-1")]: EMPTY_V3,
      [mapBodyKey("map-2")]: EMPTY_V3,
      [mapBodyKey("map-3")]: EMPTY_V3,
    };
  }

  it.each<[string, (hook: ReturnType<typeof setup>) => void]>([
    ["マップの切り替え", (hook) => {
      act(() => {
        expect(hook.result.current.switchMap("map-3").ok).toBe(true);
      });
    }],
    ["マップの作成", (hook) => {
      act(() => {
        expect(hook.result.current.createMap("新しいマップ").ok).toBe(true);
      });
    }],
    ["別のマップの削除（ゴミ箱へ移動）", (hook) => {
      act(() => {
        expect(hook.result.current.deleteMap("map-3").ok).toBe(true);
      });
    }],
    ["開いているマップの削除", (hook) => {
      act(() => {
        expect(hook.result.current.deleteMap("map-1").ok).toBe(true);
      });
    }],
    ["マップの名前変更", (hook) => {
      act(() => {
        expect(hook.result.current.renameMap("map-1", "改名").ok).toBe(true);
      });
    }],
  ])("別タブで付けたお気に入り・フォルダーの所属が、こちらの%sの後も残る", (_name, operate) => {
    const hook = setup({ initial: threeMapsWithBodies(), ids: ["new-map", "trash-id"] });
    writeFromOtherTab(hook.storage, hook.entries, (meta) =>
      folderWithMap2FromOtherTab(favoriteMap2FromOtherTab(meta)),
    );

    operate(hook);

    const stored = storedLibraryMeta(hook.entries());
    expect(stored.mapMeta["map-2"]).toMatchObject({ favorite: true, folderId: OTHER_TAB_FOLDER.id });
    expect(stored.folders).toEqual([OTHER_TAB_FOLDER]);
  });

  it("書き込みの後は、画面のメタデータも別タブの更新を含む最新になる", () => {
    const hook = setup({ initial: threeMapsWithBodies() });
    writeFromOtherTab(hook.storage, hook.entries, favoriteMap2FromOtherTab);

    act(() => {
      expect(hook.result.current.switchMap("map-3").ok).toBe(true);
    });

    const view = readyView(hook.result.current.view);
    expect(view.libraryMeta.mapMeta["map-2"]?.favorite).toBe(true);
    expect(view.libraryMeta.mapMeta["map-3"]?.lastOpenedAt).toBe(NOW);
  });

  it("別タブで付けたお気に入りが、こちらの一括バックアップの追加復元の後も残る", async () => {
    const hook = setup({ initial: threeMapsWithBodies(), ids: ["restored-map-1", "restored-folder"] });
    readyView(hook.result.current.view).storageSession.registerBackupSnapshot(() => ({
      json: EMPTY_V3,
      hydrated: true,
      restoreOrigin: "restored",
      hasSavedBodyThisMount: false,
    }));
    const backupJson = JSON.stringify({
      format: "draw-my-map-library-backup",
      version: 1,
      exportedAt: NOW,
      currentMapId: "source",
      maps: [
        { id: "source", name: "移行元", createdAt: SEED_TIMESTAMP, updatedAt: SEED_TIMESTAMP, document: JSON.parse(EMPTY_V3) },
      ],
      folders: [{ id: "bf-1", name: "仕事", createdAt: SEED_TIMESTAMP, updatedAt: SEED_TIMESTAMP }],
      mapMeta: { source: { favorite: true, folderId: "bf-1" } },
    });
    const preview = await hook.result.current.previewRestore(backupFile(async () => backupJson));
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    writeFromOtherTab(hook.storage, hook.entries, (meta) =>
      folderWithMap2FromOtherTab(favoriteMap2FromOtherTab(meta)),
    );

    act(() => {
      expect(hook.result.current.confirmRestore(preview.value).ok).toBe(true);
    });

    const stored = storedLibraryMeta(hook.entries());
    expect(stored.mapMeta["map-2"]).toMatchObject({ favorite: true, folderId: OTHER_TAB_FOLDER.id });
    expect(stored.folders.map((folder) => folder.name)).toEqual(["別タブのフォルダー", "仕事"]);
    expect(stored.mapMeta["restored-map-1"]).toMatchObject({ favorite: true });
  });

  it.each<[string, (hook: ReturnType<typeof setup>) => void]>([
    ["お気に入りの切り替え", (hook) => {
      act(() => {
        expect(hook.result.current.toggleFavorite("map-1").ok).toBe(true);
      });
    }],
    ["フォルダーの作成", (hook) => {
      act(() => {
        expect(hook.result.current.createFolder("こちらのフォルダー").ok).toBe(true);
      });
    }],
    ["フォルダーの割り当て", (hook) => {
      act(() => {
        expect(hook.result.current.assignFolder("map-1", OTHER_TAB_FOLDER.id).ok).toBe(true);
      });
    }],
    ["フォルダー名の変更", (hook) => {
      act(() => {
        expect(hook.result.current.renameFolder(OTHER_TAB_FOLDER.id, "改名したフォルダー").ok).toBe(true);
      });
    }],
  ])("別タブで作ったフォルダー・所属とお気に入りが、こちらの%sの後も残る", (_name, operate) => {
    const hook = setup({ initial: threeMapsWithBodies(), ids: ["here-folder"] });
    writeFromOtherTab(hook.storage, hook.entries, (meta) =>
      folderWithMap2FromOtherTab(favoriteMap2FromOtherTab(meta)),
    );

    operate(hook);

    const stored = storedLibraryMeta(hook.entries());
    expect(stored.mapMeta["map-2"]).toMatchObject({ favorite: true, folderId: OTHER_TAB_FOLDER.id });
    expect(stored.folders.map((folder) => folder.id)).toContain(OTHER_TAB_FOLDER.id);
    expect(readyView(hook.result.current.view).libraryMeta).toEqual(stored);
  });

  it("別タブで作ったフォルダーを、こちらで削除できる（最新を基に判定する）", () => {
    const hook = setup({ initial: threeMapsWithBodies() });
    writeFromOtherTab(hook.storage, hook.entries, folderWithMap2FromOtherTab);

    act(() => {
      expect(hook.result.current.deleteFolder(OTHER_TAB_FOLDER.id).ok).toBe(true);
    });

    const stored = storedLibraryMeta(hook.entries());
    expect(stored.folders).toEqual([]);
    expect(stored.mapMeta["map-2"]?.folderId).toBeUndefined();
  });

  it("フォルダーの上限は最新の件数で判定する（別タブで 50 件に達していたら作成しない）", () => {
    const hook = setup({ initial: threeMapsWithBodies(), ids: ["here-folder"] });
    writeFromOtherTab(hook.storage, hook.entries, (meta) => ({
      ...meta,
      folders: Array.from({ length: MAX_MAP_FOLDERS }, (_, index) => ({
        id: `full-${index}`,
        name: `満杯${index}`,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      })),
    }));
    const before = hook.entries()[MAP_LIBRARY_META_STORAGE_KEY];

    let outcome: ReturnType<typeof hook.result.current.createFolder> | undefined;
    act(() => {
      outcome = hook.result.current.createFolder("こちらのフォルダー");
    });

    expect(outcome?.ok).toBe(false);
    expect(hook.entries()[MAP_LIBRARY_META_STORAGE_KEY]).toBe(before);
  });

  it("別タブでメタデータが壊れていたら、こちらの操作は上書きせず、お気に入り操作は破損の扱いにする", () => {
    const hook = setup({ initial: threeMapsWithBodies() });
    hook.storage.setItem(MAP_LIBRARY_META_STORAGE_KEY, "{corrupt");

    let toggled: ReturnType<typeof hook.result.current.toggleFavorite> | undefined;
    act(() => {
      toggled = hook.result.current.toggleFavorite("map-1");
    });
    expect(toggled?.ok).toBe(false);
    expect(toggled?.notice?.message).toBe(
      "お気に入り・フォルダー情報が破損しているため操作できません。メタデータを初期化してから再試行してください。",
    );
    expect(readyView(hook.result.current.view).libraryMetaStatus).toBe("corrupt");
    expect(hook.entries()[MAP_LIBRARY_META_STORAGE_KEY]).toBe("{corrupt");
  });

  it("別タブでメタデータが壊れていたら、マップの切り替えは成功させ、メタデータは上書きせず warning で伝える", () => {
    const hook = setup({ initial: threeMapsWithBodies() });
    hook.storage.setItem(MAP_LIBRARY_META_STORAGE_KEY, "{corrupt");

    let switched: ReturnType<typeof hook.result.current.switchMap> | undefined;
    act(() => {
      switched = hook.result.current.switchMap("map-3");
    });

    expect(switched?.ok).toBe(true);
    expect(switched?.notice?.kind).toBe("warning");
    expect(readyView(hook.result.current.view).currentMap.id).toBe("map-3");
    expect(hook.entries()[MAP_LIBRARY_META_STORAGE_KEY]).toBe("{corrupt");
  });

  function corruptThreeMaps(): Record<string, string> {
    return { ...threeMapsWithBodies(), [MAP_LIBRARY_META_STORAGE_KEY]: "{corrupt" };
  }

  it("「メタデータを初期化」は、別タブですでに回復・更新されていたら上書きせず、画面を最新（ready）にして warning で伝える", () => {
    const hook = setup({ initial: corruptThreeMaps() });
    expect(readyView(hook.result.current.view).libraryMetaStatus).toBe("corrupt");
    // 別タブ（タブ B）が初期化し、フォルダーとお気に入りを付けた
    hook.storage.setItem(
      MAP_LIBRARY_META_STORAGE_KEY,
      encodeMapLibraryMeta(folderWithMap2FromOtherTab(favoriteMap2FromOtherTab(createEmptyMapLibraryMeta()))),
    );
    const before = hook.entries()[MAP_LIBRARY_META_STORAGE_KEY];

    let reset: ReturnType<typeof hook.result.current.resetLibraryMeta> | undefined;
    act(() => {
      reset = hook.result.current.resetLibraryMeta();
    });

    expect(reset?.ok).toBe(true);
    expect(reset?.notice).toEqual({
      kind: "warning",
      message:
        "別のタブでお気に入り・フォルダー情報がすでに回復していたため、初期化せずに最新の情報を読み込みました。",
    });
    expect(hook.entries()[MAP_LIBRARY_META_STORAGE_KEY]).toBe(before);
    const view = readyView(hook.result.current.view);
    expect(view.libraryMetaStatus).toBe("ready");
    expect(view.libraryMeta).toEqual(storedLibraryMeta(hook.entries()));
    expect(view.libraryMeta.mapMeta["map-2"]).toMatchObject({ favorite: true, folderId: OTHER_TAB_FOLDER.id });
  });

  it("「メタデータを初期化」は、最新もまだ壊れていれば従来どおり空のメタデータで初期化する", () => {
    const hook = setup({ initial: corruptThreeMaps() });

    let reset: ReturnType<typeof hook.result.current.resetLibraryMeta> | undefined;
    act(() => {
      reset = hook.result.current.resetLibraryMeta();
    });

    expect(reset?.ok).toBe(true);
    expect(reset?.notice).toEqual({ kind: "status", message: "お気に入り・フォルダー情報を初期化しました。" });
    expect(storedLibraryMeta(hook.entries())).toEqual(createEmptyMapLibraryMeta());
    expect(readyView(hook.result.current.view).libraryMetaStatus).toBe("ready");
  });

  it("「メタデータを初期化」は、直前の読み取りに失敗したら書き込まず、読み込めない扱いで拒否する", () => {
    let blockMetaRead = false;
    const hook = setup({
      initial: corruptThreeMaps(),
      throwOnGetItem: (key) => blockMetaRead && key === MAP_LIBRARY_META_STORAGE_KEY,
    });
    blockMetaRead = true;
    const writesBefore = hook.operations.filter((op) => op.key === MAP_LIBRARY_META_STORAGE_KEY).length;

    let reset: ReturnType<typeof hook.result.current.resetLibraryMeta> | undefined;
    act(() => {
      reset = hook.result.current.resetLibraryMeta();
    });

    expect(reset?.ok).toBe(false);
    expect(reset?.notice?.message).toBe("お気に入り・フォルダー情報を読み込めなかったため操作できません。");
    expect(hook.entries()[MAP_LIBRARY_META_STORAGE_KEY]).toBe("{corrupt");
    expect(hook.operations.filter((op) => op.key === MAP_LIBRARY_META_STORAGE_KEY)).toHaveLength(writesBefore);
    expect(readyView(hook.result.current.view).libraryMetaStatus).toBe("unavailable");
  });

  function registerEmptySnapshot(hook: ReturnType<typeof setup>) {
    readyView(hook.result.current.view).storageSession.registerBackupSnapshot(() => ({
      json: EMPTY_V3,
      hydrated: true,
      restoreOrigin: "restored",
      hasSavedBodyThisMount: false,
    }));
  }

  function parsedBackup(hook: ReturnType<typeof setup>) {
    const prepared = hook.result.current.prepareBackup();
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) throw new Error(prepared.error);
    const parsed = parseLibraryBackupJson(prepared.value.json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("backup parse failed");
    return { preview: prepared.value, backup: parsed.value };
  }

  it("一括バックアップの書き出しは、別タブで付けたお気に入り・フォルダーを含む最新のメタデータを使う（画面の状態は変えない）", async () => {
    const hook = setup({ initial: threeMapsWithBodies(), ids: ["restored-map-1"] });
    registerEmptySnapshot(hook);
    // 書き出しの前に開いた復元のプレビュー（書き出しで古い扱いにならないことを確かめる）
    const restorePreview = await hook.result.current.previewRestore(
      backupFile(async () =>
        JSON.stringify({
          format: "draw-my-map-library-backup",
          version: 1,
          exportedAt: NOW,
          currentMapId: "source",
          maps: [
            { id: "source", name: "移行元", createdAt: SEED_TIMESTAMP, updatedAt: SEED_TIMESTAMP, document: JSON.parse(EMPTY_V3) },
          ],
        }),
      ),
    );
    expect(restorePreview.ok).toBe(true);
    if (!restorePreview.ok) return;
    writeFromOtherTab(hook.storage, hook.entries, (meta) =>
      folderWithMap2FromOtherTab(favoriteMap2FromOtherTab(meta)),
    );
    const viewMetaBefore = readyView(hook.result.current.view).libraryMeta;

    const { backup } = parsedBackup(hook);

    expect(backup.folders).toEqual([OTHER_TAB_FOLDER]);
    expect(backup.mapMeta?.["map-2"]).toMatchObject({ favorite: true, folderId: OTHER_TAB_FOLDER.id });
    expect(backup.mapMeta?.["map-1"]).toMatchObject({ lastOpenedAt: NOW });
    // 読むだけで画面の状態は変えない（開いている復元のプレビューを古い扱いにしない）
    expect(readyView(hook.result.current.view).libraryMeta).toBe(viewMetaBefore);
    act(() => {
      expect(hook.result.current.confirmRestore(restorePreview.value).ok).toBe(true);
    });
  });

  it("一括バックアップの書き出しは、メタデータに変化が無ければ従来どおりの内容になる", () => {
    const hook = setup({ initial: threeMapsWithBodies() });
    registerEmptySnapshot(hook);

    const { backup } = parsedBackup(hook);

    expect(backup.folders).toBeUndefined();
    expect(backup.mapMeta).toEqual({ "map-1": { lastOpenedAt: NOW } });
  });

  it("一括バックアップの書き出しは、別タブでメタデータが壊れていたらメタデータ抜きで書き出し、上書きしない", () => {
    const hook = setup({ initial: threeMapsWithBodies() });
    registerEmptySnapshot(hook);
    hook.storage.setItem(MAP_LIBRARY_META_STORAGE_KEY, "{corrupt");

    const { backup } = parsedBackup(hook);

    expect(backup.folders).toBeUndefined();
    expect(backup.mapMeta).toBeUndefined();
    expect(backup.maps.map((map) => map.id)).toEqual(["map-1", "map-2", "map-3"]);
    expect(hook.entries()[MAP_LIBRARY_META_STORAGE_KEY]).toBe("{corrupt");
  });

  it("一括バックアップの書き出しは、メタデータの読み取りに失敗したらメタデータ抜きで書き出し、何も書かない", () => {
    let blockMetaRead = false;
    const hook = setup({
      initial: threeMapsWithBodies(),
      throwOnGetItem: (key) => blockMetaRead && key === MAP_LIBRARY_META_STORAGE_KEY,
    });
    registerEmptySnapshot(hook);
    blockMetaRead = true;
    const writesBefore = hook.operations.filter((op) => op.key === MAP_LIBRARY_META_STORAGE_KEY).length;

    const { backup } = parsedBackup(hook);

    expect(backup.folders).toBeUndefined();
    expect(backup.mapMeta).toBeUndefined();
    expect(hook.operations.filter((op) => op.key === MAP_LIBRARY_META_STORAGE_KEY)).toHaveLength(writesBefore);
  });

  it("書き込みの直前の読み取りに失敗したら、メタデータを上書きしない（お気に入り操作は失敗、切り替えは warning）", () => {
    let blockMetaRead = false;
    const hook = setup({
      initial: threeMapsWithBodies(),
      throwOnGetItem: (key) => blockMetaRead && key === MAP_LIBRARY_META_STORAGE_KEY,
    });
    const before = hook.entries()[MAP_LIBRARY_META_STORAGE_KEY];
    blockMetaRead = true;
    const writesBefore = hook.operations.filter(
      (op) => op.key === MAP_LIBRARY_META_STORAGE_KEY,
    ).length;

    let toggled: ReturnType<typeof hook.result.current.toggleFavorite> | undefined;
    let switched: ReturnType<typeof hook.result.current.switchMap> | undefined;
    // 切り替えは主処理を優先して成功させ、メタデータは書かずに warning（状態は ready のまま）
    act(() => {
      switched = hook.result.current.switchMap("map-3");
    });
    // お気に入り操作は拒否し、読めない状態（unavailable）を画面へ反映する
    act(() => {
      toggled = hook.result.current.toggleFavorite("map-1");
    });
    expect(readyView(hook.result.current.view).libraryMetaStatus).toBe("unavailable");

    expect(toggled?.ok).toBe(false);
    expect(toggled?.notice?.message).toBe("お気に入り・フォルダー情報を読み込めなかったため操作できません。");
    expect(switched?.ok).toBe(true);
    expect(switched?.notice?.kind).toBe("warning");
    expect(hook.entries()[MAP_LIBRARY_META_STORAGE_KEY]).toBe(before);
    expect(
      hook.operations.filter((op) => op.key === MAP_LIBRARY_META_STORAGE_KEY),
    ).toHaveLength(writesBefore);
  });
});
