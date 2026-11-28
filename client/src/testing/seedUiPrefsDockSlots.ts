import { DOCK_SLOT_IDS, type DockSlotId } from "@/domain/dock/dockSlotCatalog";
import { createDefaultDockLayout } from "@/domain/dock/defaultDockLayout";
import { DEFAULT_WHEEL_ZOOM_SENSITIVITY } from "@/domain/uiPrefs/uiPrefsModel";
import { UI_PREFS_STORAGE_KEY } from "@/services/persistence/uiPrefsStorage";

/** 結合テストが旧ヘッダー相当の全操作へ到達できるよう、全スロットを表示にする */
export function seedUiPrefsDockAllVisible(
  storage: Pick<Storage, "getItem" | "setItem"> = window.localStorage,
  visibleSlotIds: readonly DockSlotId[] = DOCK_SLOT_IDS,
): void {
  storage.setItem(
    UI_PREFS_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      wheelZoomSensitivity: DEFAULT_WHEEL_ZOOM_SENSITIVITY,
      dockLayout: { visibleSlotIds: [...visibleSlotIds] },
    }),
  );
}

/** prefs 未設定のときだけ全表示を入れる（明示的な既定テストを上書きしない） */
export function ensureUiPrefsDockAllVisibleForTests(
  storage: Pick<Storage, "getItem" | "setItem"> = window.localStorage,
): void {
  try {
    if (storage.getItem(UI_PREFS_STORAGE_KEY) != null) return;
    seedUiPrefsDockAllVisible(storage);
  } catch {
    // 保護モード等で getItem/setItem が SecurityError のときは seed をスキップする
  }
}

/** 既定 Dock（決めたこと 4）だけを prefs に書く */
export function seedUiPrefsDockDefault(
  storage: Pick<Storage, "getItem" | "setItem"> = window.localStorage,
): void {
  storage.setItem(
    UI_PREFS_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      wheelZoomSensitivity: DEFAULT_WHEEL_ZOOM_SENSITIVITY,
      dockLayout: createDefaultDockLayout(),
    }),
  );
}
