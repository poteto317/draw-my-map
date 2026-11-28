import { createDefaultDockLayout } from "@/domain/dock/defaultDockLayout";
import { encodeUiPrefs } from "@/domain/uiPrefs/uiPrefs";
import { createDefaultUiPrefs } from "@/domain/uiPrefs/uiPrefsModel";
import { createRecordingStorage } from "@/testing/mapLibraryTestStorage";
import {
  readUiPrefs,
  UI_PREFS_STORAGE_KEY,
  writeUiPrefs,
} from "@/services/persistence/uiPrefsStorage";

describe("uiPrefsStorage", () => {
  it("ストレージキー定数が設計どおりである", () => {
    expect(UI_PREFS_STORAGE_KEY).toBe("draw-my-map.ui-prefs.v1");
  });

  it("未保存時は既定値を返す", () => {
    const { storage } = createRecordingStorage();
    expect(readUiPrefs(storage).prefs).toEqual(createDefaultUiPrefs());
  });

  it("保存と読み取りが往復できる", () => {
    const { storage, operations } = createRecordingStorage();
    const document = { version: 1, wheelZoomSensitivity: 0.004 };
    const dockLayout = createDefaultDockLayout();
    expect(writeUiPrefs(storage, document)).toEqual({ ok: true });
    expect(readUiPrefs(storage).prefs).toEqual({
      version: 1,
      wheelZoomSensitivity: 0.004,
      dockLayout,
    });
    expect(operations).toEqual([
      {
        type: "setItem",
        key: UI_PREFS_STORAGE_KEY,
        value: encodeUiPrefs(document),
      },
    ]);
  });

  it("書き込み失敗時は ok: false を返す", () => {
    const { storage } = createRecordingStorage({
      failSetItem: () => true,
    });
    expect(writeUiPrefs(storage, createDefaultUiPrefs())).toEqual({
      ok: false,
      reason: "quota",
    });
  });
});