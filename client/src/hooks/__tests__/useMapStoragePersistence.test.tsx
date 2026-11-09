import { act, renderHook } from "@testing-library/react";
import { useMapStoragePersistence } from "@/hooks/useMapStoragePersistence";
import { createTestStorageSession } from "@/testing/createTestStorageSession";

const emptyMapJson = `{
  "version": 3,
  "layoutMode": "manual",
  "nodes": []
}\n`;

const nonCanonicalEmptyMapJson =
  '{"nodes":[],"layoutMode":"manual","version":2}';

const importedMapJson = `{
  "version": 1,
  "layoutMode": "auto",
  "nodes": [
    {
      "id": 10,
      "parentId": null,
      "x": 20,
      "y": 30,
      "width": 160,
      "height": 64,
      "label": "保存済み"
    }
  ]
}\n`;

const migratedMapJson = `{
  "version": 3,
  "layoutMode": "auto",
  "nodes": [
    {
      "id": 10,
      "parentId": null,
      "x": 20,
      "y": 30,
      "width": 160,
      "height": 64,
      "label": "保存済み",
      "importance": "medium"
    }
  ]
}\n`;

function flushInAct<T>(flush: () => T): T {
  let result!: T;
  act(() => { result = flush(); });
  return result;
}

describe("useMapStoragePersistence", () => {
  it("復元完了と初回失敗 origin を autoSave の結果とともに返す", () => {
    const storage = createTestStorageSession({ initialJson: "{" });
    const { result } = renderHook(() => useMapStoragePersistence({
      currentSnapshot: emptyMapJson,
      replaceMap: jest.fn(),
      storageSession: storage.session,
      storageMode: "persistent",
      publishNotice: jest.fn(),
      clearSaveFailureNotice: jest.fn(),
    }));
    expect(result.current.hydrated).toBe(true);
    expect(result.current.restoreOrigin).toBe("failed");
    expect(result.current.hasSavedBodyThisMount()).toBe(false);
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("V2保存値の表記差だけでは書き戻さない", () => {
    const storage = createTestStorageSession({ initialJson: nonCanonicalEmptyMapJson });
    const { result, rerender } = renderHook(
      ({ snapshot }) => useMapStoragePersistence({
        currentSnapshot: snapshot,
        replaceMap: jest.fn(),
        storageSession: storage.session,
        storageMode: "persistent",
        publishNotice: jest.fn(),
        clearSaveFailureNotice: jest.fn(),
      }),
      { initialProps: { snapshot: emptyMapJson } },
    );

    rerender({ snapshot: emptyMapJson });
    act(() => jest.advanceTimersByTime(300));

    expect(storage.writes).toEqual([]);
    expect(result.current.saveStatus).toBe("saved");
  });

  it("V1保存済みマップを復元して300ms後にV3で書き戻す", () => {
    const storage = createTestStorageSession({ initialJson: importedMapJson });
    const replaceMap = jest.fn();
    const { rerender } = renderHook(
      ({ snapshot }) => useMapStoragePersistence({
        currentSnapshot: snapshot,
        replaceMap,
        storageSession: storage.session,
        storageMode: "persistent",
        publishNotice: jest.fn(),
        clearSaveFailureNotice: jest.fn(),
      }),
      { initialProps: { snapshot: emptyMapJson } },
    );

    expect(replaceMap).toHaveBeenCalledWith({
      layoutMode: "auto",
      nodes: [{
        id: 10,
        parentId: null,
        x: 20,
        y: 30,
        width: 160,
        height: 64,
        label: "保存済み",
        importance: "medium" as const,
      }],
    });

    rerender({ snapshot: migratedMapJson });
    act(() => jest.advanceTimersByTime(299));
    expect(storage.writes).toEqual([]);

    act(() => jest.advanceTimersByTime(1));
    expect(storage.writes).toEqual([migratedMapJson]);
  });

  it("連続変更の最後のsnapshotだけを保存する", () => {
    const storage = createTestStorageSession({ initialJson: null });
    const { rerender } = renderHook(
      ({ snapshot }) => useMapStoragePersistence({
        currentSnapshot: snapshot,
        replaceMap: jest.fn(),
        storageSession: storage.session,
        storageMode: "persistent",
        publishNotice: jest.fn(),
        clearSaveFailureNotice: jest.fn(),
      }),
      { initialProps: { snapshot: emptyMapJson } },
    );

    rerender({ snapshot: importedMapJson });
    act(() => jest.advanceTimersByTime(299));
    expect(storage.writes).toEqual([]);

    act(() => jest.advanceTimersByTime(1));
    expect(storage.writes).toEqual([importedMapJson]);
  });

  it("現在値と同じsnapshotも明示要求なら保存する", () => {
    const storage = createTestStorageSession({ initialJson: null });
    const { result } = renderHook(() => useMapStoragePersistence({
      currentSnapshot: emptyMapJson,
      replaceMap: jest.fn(),
      storageSession: storage.session,
        storageMode: "persistent",
      publishNotice: jest.fn(),
      clearSaveFailureNotice: jest.fn(),
    }));

    act(() => result.current.requestSnapshotSave(emptyMapJson));
    act(() => jest.advanceTimersByTime(300));

    expect(storage.writes).toEqual([emptyMapJson]);
  });

  it("本体なし・復元失敗・保護モードを保存状態へ伝える", () => {
    for (const [initialJson, storageMode, expected] of [
      [null, "persistent", "beforeSave"],
      ["{", "persistent", "restoreFailed"],
      [null, "protected", "protected"],
    ] as const) {
      const storage = createTestStorageSession({ initialJson });
      const { result, unmount } = renderHook(() => useMapStoragePersistence({
        currentSnapshot: emptyMapJson,
        replaceMap: jest.fn(),
        storageSession: storage.session,
        storageMode,
        publishNotice: jest.fn(),
        clearSaveFailureNotice: jest.fn(),
      }));
      expect(result.current.saveStatus).toBe(expected);
      unmount();
    }
  });

  describe("flush の登録", () => {
    it("マウントで flush を1つ登録し、アンマウントで解除する", () => {
      const storage = createTestStorageSession({ initialJson: null });
      const { unmount } = renderHook(() => useMapStoragePersistence({
        currentSnapshot: emptyMapJson,
        replaceMap: jest.fn(),
        storageSession: storage.session,
        storageMode: "persistent",
        publishNotice: jest.fn(),
        clearSaveFailureNotice: jest.fn(),
      }));

      expect(storage.registeredFlushCount()).toBe(1);
      unmount();
      expect(storage.registeredFlushCount()).toBe(0);
      expect(flushInAct(storage.callRegisteredFlush)).toEqual({ status: "unchanged" });
    });

    it("登録した flush が保存待ちを同期で書き、戻り値の flushPendingSave と同じ結果になる", () => {
      const storage = createTestStorageSession({ initialJson: null });
      const clearSaveFailureNotice = jest.fn();
      const { result, rerender } = renderHook(
        ({ snapshot }) => useMapStoragePersistence({
          currentSnapshot: snapshot,
          replaceMap: jest.fn(),
          storageSession: storage.session,
        storageMode: "persistent",
          publishNotice: jest.fn(),
          clearSaveFailureNotice,
        }),
        { initialProps: { snapshot: emptyMapJson } },
      );

      rerender({ snapshot: importedMapJson });
      expect(flushInAct(storage.callRegisteredFlush)).toEqual({ status: "saved" });
      expect(storage.writes).toEqual([importedMapJson]);
      expect(clearSaveFailureNotice).toHaveBeenCalledTimes(1);

      expect(flushInAct(result.current.flushPendingSave)).toEqual({ status: "unchanged" });
      act(() => jest.advanceTimersByTime(300));
      expect(storage.writes).toEqual([importedMapJson]);
    });

    it("壊れた本体を復元できなかった後、変更が無ければ flush しても空のマップで上書きしない", () => {
      const storage = createTestStorageSession({ initialJson: "{" });
      const publishNotice = jest.fn();
      const replaceMap = jest.fn();
      const { result } = renderHook(() => useMapStoragePersistence({
        currentSnapshot: emptyMapJson,
        replaceMap,
        storageSession: storage.session,
        storageMode: "persistent",
        publishNotice,
        clearSaveFailureNotice: jest.fn(),
      }));

      expect(publishNotice).toHaveBeenCalledWith({
        kind: "warning",
        message: "保存データを復元できませんでした。空のマップで開始します。",
      });
      expect(replaceMap).not.toHaveBeenCalled();

      expect(flushInAct(result.current.flushPendingSave)).toEqual({ status: "unchanged" });
      expect(flushInAct(storage.callRegisteredFlush)).toEqual({ status: "unchanged" });
      expect(storage.writes).toEqual([]);

      act(() => jest.advanceTimersByTime(300));
      expect(storage.writes).toEqual([]);
    });
  });
});
