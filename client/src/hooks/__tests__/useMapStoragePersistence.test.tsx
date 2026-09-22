import { act, renderHook } from "@testing-library/react";
import { useMapStoragePersistence } from "@/hooks/useMapStoragePersistence";

const emptyMapJson = `{
  "version": 1,
  "layoutMode": "manual",
  "nodes": []
}\n`;

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

  it("保存済みマップを復元して同じsnapshotを書き戻さない", () => {
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
      }],
    });

    rerender({ snapshot: importedMapJson });
    act(() => jest.advanceTimersByTime(300));
    expect(storage.setItem).not.toHaveBeenCalled();
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
