import { act, renderHook } from "@testing-library/react";
import { DEFAULT_LAYOUT_SNAP_PREFS } from "@/domain/nodes/snapGrid";
import {
  encodeLayoutSnapPrefs,
  LAYOUT_SNAP_STORAGE_KEY,
  readSnapPrefs,
} from "@/services/layoutSnapStorage";
import { useLayoutSnapPrefs } from "@/hooks/useLayoutSnapPrefs";
import { createRecordingStorage } from "@/testing/mapLibraryTestStorage";

describe("useLayoutSnapPrefs", () => {
  it("初期読込で localStorage から設定を得る", () => {
    const stored = { enabled: false, showGrid: true, gridStep: 16 };
    const { storage } = createRecordingStorage({
      initial: {
        [LAYOUT_SNAP_STORAGE_KEY]: encodeLayoutSnapPrefs(stored),
      },
    });
    const { result } = renderHook(() => useLayoutSnapPrefs(storage));

    expect(result.current.prefs).toEqual(stored);
  });

  it("変更時に read→merge→write する（L-921）", () => {
    const { storage, operations } = createRecordingStorage();
    const { result } = renderHook(() => useLayoutSnapPrefs(storage));

    act(() => {
      result.current.setShowGrid(true);
    });

    expect(result.current.prefs.showGrid).toBe(true);
    expect(readSnapPrefs(storage)).toEqual({
      status: "ok",
      prefs: { ...DEFAULT_LAYOUT_SNAP_PREFS, showGrid: true },
    });
    expect(operations.at(-1)?.type).toBe("setItem");
  });

  it("storage イベントで別タブの変更を再読取する", () => {
    const { storage } = createRecordingStorage();
    const { result } = renderHook(() => useLayoutSnapPrefs(storage));

    storage.setItem(
      LAYOUT_SNAP_STORAGE_KEY,
      encodeLayoutSnapPrefs({ enabled: false, showGrid: true, gridStep: 20 }),
    );

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: LAYOUT_SNAP_STORAGE_KEY,
          newValue: storage.getItem(LAYOUT_SNAP_STORAGE_KEY),
        }),
      );
    });

    expect(result.current.prefs).toEqual({
      enabled: false,
      showGrid: true,
      gridStep: 20,
    });
  });

  it("破損時はメモリ上は既定値で開始する", () => {
    const { storage } = createRecordingStorage({
      initial: { [LAYOUT_SNAP_STORAGE_KEY]: "{broken" },
    });
    const { result } = renderHook(() => useLayoutSnapPrefs(storage));

    expect(result.current.prefs).toEqual(DEFAULT_LAYOUT_SNAP_PREFS);
  });
});