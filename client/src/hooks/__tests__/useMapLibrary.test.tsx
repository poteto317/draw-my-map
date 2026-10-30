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
import { useMapLibrary, type MapLibraryDeps } from "@/hooks/useMapLibrary";
import {
  MAP_INDEX_STORAGE_KEY,
  mapBodyKey,
} from "@/services/persistence/mapLibraryStorage";
import { MAP_STORAGE_KEY } from "@/services/persistence/mapStorage";
import { createRecordingStorage } from "@/testing/mapLibraryTestStorage";
import type { MapStorageSession } from "@/types/mapStorageSession";

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
  } = {},
) {
  let failIndexWrite = false;
  const recording = createRecordingStorage({
    initial: options.initial,
    failSetItem: (key) => failIndexWrite && key === MAP_INDEX_STORAGE_KEY,
    failRemoveItem: options.failRemoveItem,
    beforeRemoveItem: options.beforeRemoveItem,
  });
  const deps: MapLibraryDeps = {
    getStorage: () => recording.storage,
    now: () => new Date(NOW),
    generateId: idSequence(options.ids ?? []),
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
      });
      expect(operations.slice(before).map((operation) => operation.key)).toEqual([
        mapBodyKey("map-1"),
        MAP_INDEX_STORAGE_KEY,
        MAP_INDEX_STORAGE_KEY,
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
      it("インデックス → 本体の順に書き、現在のマップは開いたまま", () => {
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
          ["setItem", MAP_INDEX_STORAGE_KEY],
          ["removeItem", mapBodyKey("map-b")],
        ]);
        expect(entries()[mapBodyKey("map-b")]).toBeUndefined();
        expect(storedIndex(entries()).currentMapId).toBe("map-a");
        expect(storedIndex(entries()).maps.map((map) => map.id)).toEqual([
          "map-a",
          "map-c",
        ]);
        const view = readyView(result.current.view);
        expect(view.currentMap.id).toBe("map-a");
        expect(view.maps.map((map) => map.id)).toEqual(["map-c", "map-a"]);
        expect(view.storageSession).toBe(sessionBefore);
      });

      it("本体の削除に失敗したら、インデックスからは消え、本体は残り、warning だけを返す", () => {
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
        expect(storedIndex(entries()).maps.map((map) => map.id)).toEqual([
          "map-a",
          "map-c",
        ]);
        expect(readyView(result.current.view).maps.map((map) => map.id)).toEqual([
          "map-c",
          "map-a",
        ]);
      });

      it("インデックスの書き込みに失敗したら中止し、本体を消さない", () => {
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
        });
        expect(operations.slice(before).map((operation) => operation.type)).toEqual([
          "setItem",
        ]);
        expect(entries()[mapBodyKey("map-b")]).toBe("body-b");
        expect(flush).not.toHaveBeenCalled();
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
          ["setItem", MAP_INDEX_STORAGE_KEY],
          ["removeItem", mapBodyKey("map-a")],
        ]);
        expect(entries()[mapBodyKey("map-a")]).toBeUndefined();
        expect(storedIndex(entries()).currentMapId).toBe("map-b");
        const view = readyView(result.current.view);
        expect(view.currentMap.id).toBe("map-b");
        expect(view.storageSession.mapId).toBe("map-b");
        expect(view.storageSession).not.toBe(oldSession);
        expect(view.maps.map((map) => map.id)).toEqual(["map-b", "map-c"]);
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
        });
        expect(result.current.view).toBe(viewBefore);
        expect(entries()[mapBodyKey("map-a")]).toBe("body-a");

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
          ["setItem", MAP_INDEX_STORAGE_KEY],
          ["removeItem", mapBodyKey("only")],
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
        const view = readyView(result.current.view);
        expect(view.currentMap).toEqual(expected);
        expect(view.maps).toEqual([expected]);
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
      const viewAfter = readyView(result.current.view);
      expect(viewAfter.currentMap.id).toBe("memory");
      expect(viewAfter.currentMap.name).toBe("無題のマップ");
    });
  });
});
