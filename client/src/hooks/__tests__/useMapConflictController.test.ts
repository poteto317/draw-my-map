import { act, renderHook } from "@testing-library/react";
import { encodeMapIndex, type MapIndexV1 } from "@/domain/mapLibrary/mapIndex";
import {
  MAP_INDEX_STORAGE_KEY,
  mapBodyKey,
  type MapLibraryStorage,
} from "@/services/persistence/mapLibraryStorage";
import { emitStorageEventForTesting } from "@/services/persistence/storageEventHub";
import { createTestStorageSession } from "@/testing/createTestStorageSession";
import { createTestNode } from "@/testing/createTestNode";
import {
  createMapDocument,
  serializeMapDocument,
} from "@/domain/persistence/mapDocumentCodec";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import {
  useMapConflictController,
  type UseMapConflictControllerOptions,
} from "@/hooks/useMapConflictController";

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

const sampleNodes: readonly Node[] = [
  createTestNode({ id: 1, label: "ルート" }),
];

describe("useMapConflictController", () => {
  const mapId = "test-map";
  let storage: MapLibraryStorage;

  beforeEach(() => {
    const index = createIndex([mapId, "other-map"], mapId);
    storage = createDummyStorage({
      [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index),
      [mapBodyKey(mapId)]: serializeMapDocument(createMapDocument(sampleNodes, "manual")),
    });
  });

  function setupController(overrides: Partial<UseMapConflictControllerOptions> = {}) {
    const replaceMapAndReset = jest.fn();
    const testSession = createTestStorageSession({
      mapId,
      storage,
      initialJson: serializeMapDocument(createMapDocument(sampleNodes, "manual")),
    });

    const defaultOptions: UseMapConflictControllerOptions = {
      storageSession: testSession.session,
      nodes: sampleNodes,
      layoutMode: "manual" as NodeLayoutMode,
      mapName: "テストマップ",
      getHasPendingEdits: () => false,
      replaceMapAndReset,
      ...overrides,
    };

    const rendered = renderHook(
      (props: UseMapConflictControllerOptions) => useMapConflictController(props),
      { initialProps: defaultOptions },
    );

    return {
      ...rendered,
      replaceMapAndReset,
      testSession,
    };
  }

  describe("初期状態", () => {
    it("競合なし・モーダル閉じ・通知なしの初期状態を返す", () => {
      const { result } = setupController();

      expect(result.current.conflictState).toBe("none");
      expect(result.current.isConfirmOpen).toBe(false);
      expect(result.current.conflictActionNotice).toBeNull();
    });
  });

  describe("外部ストレージイベント検知", () => {
    it("未保存編集がない状態で他タブが保存すると externalUpdate になる", () => {
      const { result } = setupController({ getHasPendingEdits: () => false });

      act(() => {
        emitStorageEventForTesting(
          new StorageEvent("storage", {
            key: mapBodyKey(mapId),
            newValue: '{"version":3,"nodes":[]}',
          }),
        );
      });

      expect(result.current.conflictState).toBe("externalUpdate");
    });

    it("未保存編集がある状態で他タブが保存すると conflict になる", () => {
      const { result } = setupController({ getHasPendingEdits: () => true });

      act(() => {
        emitStorageEventForTesting(
          new StorageEvent("storage", {
            key: mapBodyKey(mapId),
            newValue: '{"version":3,"nodes":[]}',
          }),
        );
      });

      expect(result.current.conflictState).toBe("conflict");
    });

    it("他タブでマップが削除されると externallyDeleted になる", () => {
      const { result } = setupController();
      const updatedIndex = createIndex(["other-map"], "other-map");
      storage.setItem(MAP_INDEX_STORAGE_KEY, encodeMapIndex(updatedIndex));

      act(() => {
        emitStorageEventForTesting(
          new StorageEvent("storage", {
            key: MAP_INDEX_STORAGE_KEY,
            newValue: encodeMapIndex(updatedIndex),
          }),
        );
      });

      expect(result.current.conflictState).toBe("externallyDeleted");
    });
  });

  describe("自タブ編集による昇格", () => {
    it("externalUpdate 状態で未保存編集が発生すると即座に conflict に昇格する（純粋派生計算）", () => {
      let hasEdits = false;
      const { result, rerender } = setupController({
        getHasPendingEdits: () => hasEdits,
      });

      act(() => {
        emitStorageEventForTesting(
          new StorageEvent("storage", {
            key: mapBodyKey(mapId),
            newValue: '{"version":3,"nodes":[]}',
          }),
        );
      });
      expect(result.current.conflictState).toBe("externalUpdate");

      hasEdits = true;
      rerender({
        storageSession: createTestStorageSession({ mapId, storage }).session,
        nodes: sampleNodes,
        layoutMode: "manual",
        mapName: "テストマップ",
        getHasPendingEdits: () => true,
        replaceMapAndReset: jest.fn(),
      });

      expect(result.current.conflictState).toBe("conflict");
    });

    it("none 状態で未保存編集が発生しても conflict にはならない", () => {
      let hasEdits = false;
      const { result, rerender } = setupController({
        getHasPendingEdits: () => hasEdits,
      });

      hasEdits = true;
      rerender({
        storageSession: createTestStorageSession({ mapId, storage }).session,
        nodes: sampleNodes,
        layoutMode: "manual",
        mapName: "テストマップ",
        getHasPendingEdits: () => true,
        replaceMapAndReset: jest.fn(),
      });

      expect(result.current.conflictState).toBe("none");
    });
  });

  describe("onWriteConflict", () => {
    it("onWriteConflict を呼び出すと conflictState が conflict になる", () => {
      const { result } = setupController();

      act(() => {
        result.current.onWriteConflict();
      });

      expect(result.current.conflictState).toBe("conflict");
    });
  });

  describe("最新を読み込む（handleReloadExternal / handleConfirmReload / handleCancelConfirm）", () => {
    it("未編集・externalUpdate の場合はダイアログを開かずに即時再読み込みする", () => {
      const validExternalDoc = createMapDocument(
        [createTestNode({ id: 99, label: "外部更新ノード" })],
        "auto",
      );
      const { result, replaceMapAndReset } = setupController({
        getHasPendingEdits: () => false,
        storageSession: createTestStorageSession({
          mapId,
          storage,
          initialJson: serializeMapDocument(validExternalDoc),
        }).session,
      });

      act(() => {
        emitStorageEventForTesting(
          new StorageEvent("storage", {
            key: mapBodyKey(mapId),
            newValue: serializeMapDocument(validExternalDoc),
          }),
        );
      });
      expect(result.current.conflictState).toBe("externalUpdate");

      act(() => {
        result.current.handleReloadExternal();
      });

      expect(result.current.isConfirmOpen).toBe(false);
      expect(replaceMapAndReset).toHaveBeenCalledWith(validExternalDoc);
      expect(result.current.conflictState).toBe("none");
      expect(result.current.conflictActionNotice).toEqual({
        kind: "status",
        message: "別タブの最新内容を読み込みました。",
      });
    });

    it("hasPendingEdits: true の場合は確認ダイアログを開く", () => {
      const { result } = setupController({ getHasPendingEdits: () => true });

      act(() => {
        result.current.handleReloadExternal();
      });

      expect(result.current.isConfirmOpen).toBe(true);

      act(() => {
        result.current.handleCancelConfirm();
      });

      expect(result.current.isConfirmOpen).toBe(false);
    });

    it("conflictState: conflict の場合は未編集でも確認ダイアログを開く", () => {
      const { result } = setupController({ getHasPendingEdits: () => false });

      act(() => {
        result.current.onWriteConflict();
      });
      expect(result.current.conflictState).toBe("conflict");

      act(() => {
        result.current.handleReloadExternal();
      });

      expect(result.current.isConfirmOpen).toBe(true);
    });

    it("確認ダイアログから confirm すると最新データを読み込んで完了通知を表示する", () => {
      const validExternalDoc = createMapDocument(
        [createTestNode({ id: 10, label: "外部ノード" })],
        "manual",
      );
      const { result, replaceMapAndReset } = setupController({
        getHasPendingEdits: () => true,
        storageSession: createTestStorageSession({
          mapId,
          storage,
          initialJson: serializeMapDocument(validExternalDoc),
        }).session,
      });

      act(() => {
        result.current.handleReloadExternal();
      });
      expect(result.current.isConfirmOpen).toBe(true);

      act(() => {
        result.current.handleConfirmReload();
      });

      expect(replaceMapAndReset).toHaveBeenCalledWith(validExternalDoc);
      expect(result.current.isConfirmOpen).toBe(false);
      expect(result.current.conflictState).toBe("none");
      expect(result.current.conflictActionNotice).toEqual({
        kind: "status",
        message: "別タブの最新内容を読み込みました。",
      });
    });

    it("最新内容読み込み・パース成功時に rebaseSnapshot が外部最新 JSON で呼び出される", () => {
      const validExternalDoc = createMapDocument(
        [createTestNode({ id: 99, label: "外部更新ノード" })],
        "auto",
      );
      const externalJson = serializeMapDocument(validExternalDoc);
      const rebaseSnapshot = jest.fn();
      const { result } = setupController({
        getHasPendingEdits: () => true,
        rebaseSnapshot,
        storageSession: createTestStorageSession({
          mapId,
          storage,
          initialJson: externalJson,
        }).session,
      });

      act(() => {
        result.current.handleConfirmReload();
      });

      expect(rebaseSnapshot).toHaveBeenCalledWith(externalJson);
    });

    it("読み込み時に readBody が失敗した場合はエラー通知を表示する", () => {
      const { result } = setupController({
        getHasPendingEdits: () => true,
        storageSession: createTestStorageSession({
          mapId,
          storage,
          readError: "ストレージの読み込みに失敗しました",
        }).session,
      });

      act(() => {
        result.current.handleReloadExternal();
      });

      act(() => {
        result.current.handleConfirmReload();
      });

      expect(result.current.isConfirmOpen).toBe(false);
      expect(result.current.conflictActionNotice).toEqual({
        kind: "error",
        message: "ストレージの読み込みに失敗しました",
      });
    });

    it("読み込み時に外部ですでに削除されていた場合は externallyDeleted に遷移する", () => {
      const { result } = setupController({
        getHasPendingEdits: () => true,
        storageSession: createTestStorageSession({
          mapId,
          storage,
          initialJson: null,
        }).session,
      });

      act(() => {
        result.current.handleReloadExternal();
      });

      act(() => {
        result.current.handleConfirmReload();
      });

      expect(result.current.isConfirmOpen).toBe(false);
      expect(result.current.conflictState).toBe("externallyDeleted");
    });

    it("読み込みデータが破損していた場合はパースエラー通知を表示する", () => {
      const { result } = setupController({
        getHasPendingEdits: () => true,
        storageSession: createTestStorageSession({
          mapId,
          storage,
          initialJson: "{ invalid json",
        }).session,
      });

      act(() => {
        result.current.handleReloadExternal();
      });

      act(() => {
        result.current.handleConfirmReload();
      });

      expect(result.current.isConfirmOpen).toBe(false);
      expect(result.current.conflictActionNotice).toEqual({
        kind: "error",
        message: expect.any(String),
      });
    });
  });

  describe("別名で保存（handleSaveAsCopy）", () => {
    it("onSaveCurrentAsNewMap が未指定の場合は何もしない", () => {
      const { result } = setupController({ onSaveCurrentAsNewMap: undefined });

      act(() => {
        result.current.onWriteConflict();
      });
      expect(result.current.conflictState).toBe("conflict");

      act(() => {
        result.current.handleSaveAsCopy();
      });

      expect(result.current.conflictState).toBe("conflict");
      expect(result.current.conflictActionNotice).toBeNull();
    });

    it("別名保存が成功した場合は conflictState を none にリセットする", () => {
      const onSaveCurrentAsNewMap = jest.fn().mockReturnValue({ ok: true, mapId: "new-map" });
      const { result } = setupController({ onSaveCurrentAsNewMap });

      act(() => {
        result.current.onWriteConflict();
      });
      expect(result.current.conflictState).toBe("conflict");

      act(() => {
        result.current.handleSaveAsCopy();
      });

      expect(onSaveCurrentAsNewMap).toHaveBeenCalledWith(
        "テストマップ（退避）",
        expect.stringContaining('"version": 3'),
      );
      expect(result.current.conflictState).toBe("none");
      expect(result.current.conflictActionNotice).toBeNull();
    });

    it("別名保存が失敗した場合は conflictActionNotice にエラー通知を表示する", () => {
      const onSaveCurrentAsNewMap = jest.fn().mockReturnValue({
        ok: false,
        notice: { kind: "error", message: "マップ一覧の上限に達しています。" },
      });
      const { result } = setupController({ onSaveCurrentAsNewMap });

      act(() => {
        result.current.onWriteConflict();
      });

      act(() => {
        result.current.handleSaveAsCopy();
      });

      expect(result.current.conflictState).toBe("conflict");
      expect(result.current.conflictActionNotice).toEqual({
        kind: "error",
        message: "マップ一覧の上限に達しています。",
      });
    });
  });
});
