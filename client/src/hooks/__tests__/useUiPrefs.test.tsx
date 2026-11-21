import { act, renderHook } from "@testing-library/react";
import { DEFAULT_WHEEL_ZOOM_SENSITIVITY } from "@/domain/uiPrefs/uiPrefsModel";
import { createRecordingStorage } from "@/testing/mapLibraryTestStorage";
import { UI_PREFS_STORAGE_KEY } from "@/services/persistence/uiPrefsStorage";
import { useUiPrefs } from "@/hooks/useUiPrefs";

describe("useUiPrefs", () => {
  it("初期読込で localStorage から感度を得る", () => {
    const { storage } = createRecordingStorage({
      initial: {
        [UI_PREFS_STORAGE_KEY]: JSON.stringify({
          version: 1,
          wheelZoomSensitivity: 0.004,
        }),
      },
    });
    const { result } = renderHook(() => useUiPrefs(storage));

    expect(result.current.prefs.wheelZoomSensitivity).toBe(0.004);
  });

  it("感度変更でストレージへ書き込む", () => {
    const { storage, operations } = createRecordingStorage();
    const { result } = renderHook(() => useUiPrefs(storage));

    act(() => {
      result.current.setWheelZoomSensitivity(0.005);
    });

    expect(result.current.prefs.wheelZoomSensitivity).toBe(0.005);
    expect(operations.at(-1)).toEqual({
      type: "setItem",
      key: UI_PREFS_STORAGE_KEY,
      value: JSON.stringify({ version: 1, wheelZoomSensitivity: 0.005 }),
    });
  });

  it("書き込み失敗でもメモリ上の感度は更新する", () => {
    const { storage } = createRecordingStorage({
      failSetItem: () => true,
    });
    const { result } = renderHook(() => useUiPrefs(storage));

    act(() => {
      result.current.setWheelZoomSensitivity(0.0035);
    });

    expect(result.current.prefs.wheelZoomSensitivity).toBe(0.0035);
  });

  it("未保存時は既定感度から始まる", () => {
    const { storage } = createRecordingStorage();
    const { result } = renderHook(() => useUiPrefs(storage));

    expect(result.current.prefs.wheelZoomSensitivity)
      .toBe(DEFAULT_WHEEL_ZOOM_SENSITIVITY);
  });
});