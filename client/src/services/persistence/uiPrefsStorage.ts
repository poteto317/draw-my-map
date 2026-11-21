import { decodeUiPrefs, encodeUiPrefs, type UiPrefsV1 } from "@/domain/uiPrefs/uiPrefs";
import {
  isQuotaExceededError,
  type MapLibraryStorage,
} from "./mapLibraryStorage";

export const UI_PREFS_STORAGE_KEY = "draw-my-map.ui-prefs.v1";

export type UiPrefsReadResult = {
  readonly prefs: UiPrefsV1;
  readonly repaired: boolean;
  readonly document: Record<string, unknown>;
};

export type UiPrefsWriteResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "quota" | "write-error" | "read-error" };

export function readUiPrefs(storage: MapLibraryStorage): UiPrefsReadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(UI_PREFS_STORAGE_KEY);
  } catch {
    const decoded = decodeUiPrefs(null);
    return {
      prefs: decoded.prefs,
      repaired: decoded.repaired,
      document: decoded.document,
    };
  }
  const decoded = decodeUiPrefs(raw);
  return {
    prefs: decoded.prefs,
    repaired: decoded.repaired,
    document: decoded.document,
  };
}

export function writeUiPrefs(
  storage: MapLibraryStorage,
  document: Record<string, unknown>,
): UiPrefsWriteResult {
  try {
    storage.setItem(UI_PREFS_STORAGE_KEY, encodeUiPrefs(document));
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: isQuotaExceededError(error) ? "quota" : "write-error",
    };
  }
}