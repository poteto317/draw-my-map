import { StrictMode } from "react";
import { renderHook } from "@testing-library/react";
import { encodeMapIndex, type MapIndexV1 } from "@/domain/mapLibrary/mapIndex";
import {
  MAP_INDEX_STORAGE_KEY,
  mapBodyKey,
  type MapLibraryStorage,
} from "@/services/persistence/mapLibraryStorage";
import { emitStorageEventForTesting } from "@/services/persistence/storageEventHub";
import { useStorageConflictMonitor } from "@/hooks/useStorageConflictMonitor";

function createDummyStorage(initialItems: Record<string, string> = {}): MapLibraryStorage {
  const map = new Map<string, string>(Object.entries(initialItems));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    length: map.size,
  };
}

function createIndex(mapIds: string[], currentMapId: string): MapIndexV1 {
  return {
    version: 1,
    currentMapId,
    maps: mapIds.map((id) => ({
      id,
      name: `Map ${id}`,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    })),
    legacyCleanupPending: false,
  };
}

describe("useStorageConflictMonitor", () => {
  const currentMapId = "map-1";
  let storage: MapLibraryStorage;
  let onExternalChange: jest.Mock;

  beforeEach(() => {
    const index = createIndex(["map-1", "map-2"], "map-1");
    storage = createDummyStorage({
      [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
      [mapBodyKey("map-1")]: "{}",
      [mapBodyKey("map-2")]: "{}",
    });
    onExternalChange = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("未保存編集があるとき、現在マップ本体の外部更新で conflict を通知する", () => {
    renderHook(() =>
      useStorageConflictMonitor({
        mapId: currentMapId,
        sessionNumber: 1,
        getHasPendingEdits: () => true,
        storage,
        onExternalChange,
      }),
    );

    emitStorageEventForTesting(
      new StorageEvent("storage", {
        key: mapBodyKey(currentMapId),
        newValue: '{"version":3,"nodes":[{"id":1}]}',
      }),
    );

    expect(onExternalChange).toHaveBeenCalledWith("conflict");
  });

  it("未保存編集がないとき、現在マップ本体の外部更新で externalUpdate を通知する", () => {
    renderHook(() =>
      useStorageConflictMonitor({
        mapId: currentMapId,
        sessionNumber: 1,
        getHasPendingEdits: () => false,
        storage,
        onExternalChange,
      }),
    );

    emitStorageEventForTesting(
      new StorageEvent("storage", {
        key: mapBodyKey(currentMapId),
        newValue: '{"version":3,"nodes":[{"id":1}]}',
      }),
    );

    expect(onExternalChange).toHaveBeenCalledWith("externalUpdate");
  });

  it("現在マップ本体が削除されたとき、externallyDeleted を通知する", () => {
    renderHook(() =>
      useStorageConflictMonitor({
        mapId: currentMapId,
        sessionNumber: 1,
        getHasPendingEdits: () => true,
        storage,
        onExternalChange,
      }),
    );

    emitStorageEventForTesting(
      new StorageEvent("storage", {
        key: mapBodyKey(currentMapId),
        newValue: null,
      }),
    );

    expect(onExternalChange).toHaveBeenCalledWith("externallyDeleted");
  });

  it("インデックス変更で現在マップが一覧から削除されたとき、externallyDeleted を通知する", () => {
    renderHook(() =>
      useStorageConflictMonitor({
        mapId: currentMapId,
        sessionNumber: 1,
        getHasPendingEdits: () => false,
        storage,
        onExternalChange,
      }),
    );

    // インデックスから map-1 が消えた状態にする
    const nextIndex = createIndex(["map-2"], "map-2");
    storage.setItem(MAP_INDEX_STORAGE_KEY, encodeMapIndex(nextIndex));

    emitStorageEventForTesting(
      new StorageEvent("storage", {
        key: MAP_INDEX_STORAGE_KEY,
        newValue: encodeMapIndex(nextIndex),
      }),
    );

    expect(onExternalChange).toHaveBeenCalledWith("externallyDeleted");
  });

  it("インデックス変更でも現在マップが一覧に残っている場合は通知しない", () => {
    renderHook(() =>
      useStorageConflictMonitor({
        mapId: currentMapId,
        sessionNumber: 1,
        getHasPendingEdits: () => false,
        storage,
        onExternalChange,
      }),
    );

    // map-3 が追加されたが map-1 は残っている
    const nextIndex = createIndex(["map-1", "map-2", "map-3"], "map-1");
    storage.setItem(MAP_INDEX_STORAGE_KEY, encodeMapIndex(nextIndex));

    emitStorageEventForTesting(
      new StorageEvent("storage", {
        key: MAP_INDEX_STORAGE_KEY,
        newValue: encodeMapIndex(nextIndex),
      }),
    );

    expect(onExternalChange).not.toHaveBeenCalled();
  });

  it("別マップの更新イベントでは通知しない", () => {
    renderHook(() =>
      useStorageConflictMonitor({
        mapId: currentMapId,
        sessionNumber: 1,
        getHasPendingEdits: () => true,
        storage,
        onExternalChange,
      }),
    );

    emitStorageEventForTesting(
      new StorageEvent("storage", {
        key: mapBodyKey("map-2"),
        newValue: '{"version":3}',
      }),
    );

    expect(onExternalChange).not.toHaveBeenCalled();
  });

  it("sessionNumber 世代不一致のイベントは無視する（知見 L-037 / L-571）", () => {
    let capturedListener: ((event: StorageEvent) => void) | null = null;
    jest
      .spyOn(window, "addEventListener")
      .mockImplementation((type, listener) => {
        if (type === "storage" && !capturedListener && typeof listener === "function") {
          capturedListener = listener as (event: StorageEvent) => void;
        }
      });

    const { rerender } = renderHook(
      ({ sessionNumber }) =>
        useStorageConflictMonitor({
          mapId: currentMapId,
          sessionNumber,
          getHasPendingEdits: () => true,
          storage,
          onExternalChange,
        }),
      { initialProps: { sessionNumber: 1 } },
    );

    expect(capturedListener).not.toBeNull();

    // sessionNumber を 2 に更新
    rerender({ sessionNumber: 2 });

    // 古い世代（sessionNumber: 1）のリスナーへ本体更新イベントを渡す
    capturedListener!(
      new StorageEvent("storage", {
        key: mapBodyKey(currentMapId),
        newValue: '{"version":3,"nodes":[{"id":1}]}',
      }),
    );

    // 世代番号が一致しないため、onExternalChange は呼び出されないことを検証
    expect(onExternalChange).not.toHaveBeenCalled();
  });

  it("アンマウント後はイベントを受信しても通知しない", () => {
    const { unmount } = renderHook(() =>
      useStorageConflictMonitor({
        mapId: currentMapId,
        sessionNumber: 1,
        getHasPendingEdits: () => true,
        storage,
        onExternalChange,
      }),
    );

    unmount();

    emitStorageEventForTesting(
      new StorageEvent("storage", {
        key: mapBodyKey(currentMapId),
        newValue: '{"version":3}',
      }),
    );

    expect(onExternalChange).not.toHaveBeenCalled();
  });

  it("StrictMode 二重実行後もリスナーが正しく機能する（知見 L-469）", () => {
    renderHook(
      () =>
        useStorageConflictMonitor({
          mapId: currentMapId,
          sessionNumber: 1,
          getHasPendingEdits: () => true,
          storage,
          onExternalChange,
        }),
      { wrapper: StrictMode },
    );

    emitStorageEventForTesting(
      new StorageEvent("storage", {
        key: mapBodyKey(currentMapId),
        newValue: '{"version":3}',
      }),
    );

    expect(onExternalChange).toHaveBeenCalledWith("conflict");
  });
});
