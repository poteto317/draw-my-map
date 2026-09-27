import { act, renderHook } from "@testing-library/react";
import { useMapStoragePersistence } from "@/hooks/useMapStoragePersistence";

const emptyMapJson = `{
  "version": 2,
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
  "version": 2,
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

function storageDouble(initialValue: string | null) {
  let value = initialValue;
  return {
    getItem: jest.fn(() => value),
    setItem: jest.fn((_key: string, nextValue: string) => {
      value = nextValue;
    }),
  };
}

describe("useMapStoragePersistence", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("V2保存値の表記差だけでは書き戻さない", () => {
    const storage = storageDouble(nonCanonicalEmptyMapJson);
    const { rerender } = renderHook(
      ({ snapshot }) => useMapStoragePersistence({
        currentSnapshot: snapshot,
        replaceMap: jest.fn(),
        storage,
        publishNotice: jest.fn(),
      }),
      { initialProps: { snapshot: emptyMapJson } },
    );

    rerender({ snapshot: emptyMapJson });
    act(() => jest.advanceTimersByTime(300));

    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("V1保存済みマップを復元して300ms後にV2で書き戻す", () => {
    const storage = storageDouble(importedMapJson);
    const replaceMap = jest.fn();
    const { rerender } = renderHook(
      ({ snapshot }) => useMapStoragePersistence({
        currentSnapshot: snapshot,
        replaceMap,
        storage,
        publishNotice: jest.fn(),
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
    expect(storage.setItem).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(1));
    expect(storage.setItem).toHaveBeenCalledWith(
      "draw-my-map.map.v1",
      migratedMapJson,
    );
  });

  it("連続変更の最後のsnapshotだけを保存する", () => {
    const storage = storageDouble(null);
    const { rerender } = renderHook(
      ({ snapshot }) => useMapStoragePersistence({
        currentSnapshot: snapshot,
        replaceMap: jest.fn(),
        storage,
        publishNotice: jest.fn(),
      }),
      { initialProps: { snapshot: emptyMapJson } },
    );

    rerender({ snapshot: importedMapJson });
    act(() => jest.advanceTimersByTime(299));
    expect(storage.setItem).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(1));
    expect(storage.setItem).toHaveBeenCalledWith(
      "draw-my-map.map.v1",
      importedMapJson,
    );
  });

  it("現在値と同じsnapshotも明示要求なら保存する", () => {
    const storage = storageDouble(null);
    const { result } = renderHook(() => useMapStoragePersistence({
      currentSnapshot: emptyMapJson,
      replaceMap: jest.fn(),
      storage,
      publishNotice: jest.fn(),
    }));

    act(() => result.current.requestSnapshotSave(emptyMapJson));
    act(() => jest.advanceTimersByTime(300));

    expect(storage.setItem).toHaveBeenCalledWith(
      "draw-my-map.map.v1",
      emptyMapJson,
    );
  });
});
