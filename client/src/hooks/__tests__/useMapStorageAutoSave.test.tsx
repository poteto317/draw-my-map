import { act, renderHook } from "@testing-library/react";
import { useMapStorageAutoSave } from "@/hooks/useMapStorageAutoSave";

const emptyMapJson = `{
  "version": 2,
  "layoutMode": "manual",
  "nodes": []
}\n`;

const changedMapJson = `{
  "version": 2,
  "layoutMode": "auto",
  "nodes": []
}\n`;

describe("useMapStorageAutoSave", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("復元基準から変化した最新snapshotを300ms後に保存する", () => {
    const setItem = jest.fn();
    const { rerender } = renderHook(
      ({ snapshot }) => useMapStorageAutoSave({
        currentSnapshot: snapshot,
        hydrated: true,
        initialPersistedSnapshot: emptyMapJson,
        publishNotice: jest.fn(),
        storage: { setItem },
      }),
      { initialProps: { snapshot: emptyMapJson } },
    );

    act(() => jest.advanceTimersByTime(300));
    expect(setItem).not.toHaveBeenCalled();

    rerender({ snapshot: changedMapJson });
    act(() => jest.advanceTimersByTime(300));
    expect(setItem).toHaveBeenCalledWith(
      "draw-my-map.map.v1",
      changedMapJson,
    );
  });

  it("明示要求された現在snapshotを保存する", () => {
    const setItem = jest.fn();
    const { result } = renderHook(() => useMapStorageAutoSave({
      currentSnapshot: emptyMapJson,
      hydrated: true,
      initialPersistedSnapshot: emptyMapJson,
      publishNotice: jest.fn(),
      storage: { setItem },
    }));

    act(() => result.current.requestSnapshotSave(emptyMapJson));
    act(() => jest.advanceTimersByTime(300));
    expect(setItem).toHaveBeenCalledWith(
      "draw-my-map.map.v1",
      emptyMapJson,
    );
  });
});
