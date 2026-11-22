import {
  decodeLayoutSnapPrefsFromUnknown,
  DEFAULT_LAYOUT_SNAP_PREFS,
  isValidLayoutSnapPrefs,
  mergeLayoutSnapPrefs,
  type LayoutSnapPrefs,
} from "@/domain/nodes/snapGrid";
import {
  isQuotaExceededError,
  type MapLibraryStorage,
} from "@/services/persistence/mapLibraryStorage";

export const LAYOUT_SNAP_STORAGE_KEY = "draw-my-map.layout-snap.v1";

export function createInMemoryMapLibraryStorage(): MapLibraryStorage {
  const memory = new Map<string, string>();
  return {
    get length() {
      return memory.size;
    },
    key(index: number) {
      return [...memory.keys()][index] ?? null;
    },
    getItem(key: string) {
      return memory.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      memory.set(key, value);
    },
    removeItem(key: string) {
      memory.delete(key);
    },
  };
}

export function resolveLayoutSnapStorage(): MapLibraryStorage {
  try {
    return window.localStorage;
  } catch {
    return createInMemoryMapLibraryStorage();
  }
}

export type SnapPrefsReadResult =
  | { readonly status: "ok"; readonly prefs: LayoutSnapPrefs }
  | { readonly status: "corrupt" }
  | { readonly status: "read-error" };

export type SnapPrefsWriteResult =
  | { readonly status: "ok" }
  | { readonly status: "quota-exceeded" }
  | { readonly status: "write-error" };

export function encodeLayoutSnapPrefs(prefs: LayoutSnapPrefs): string {
  return JSON.stringify({
    version: 1,
    enabled: prefs.enabled,
    showGrid: prefs.showGrid,
    gridStep: prefs.gridStep,
  });
}

// セッション設定を読む。破損・読取不能は空成功にしない（L-921）
export function readSnapPrefs(storage: MapLibraryStorage): SnapPrefsReadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(LAYOUT_SNAP_STORAGE_KEY);
  } catch {
    return { status: "read-error" };
  }

  if (raw === null) {
    return { status: "ok", prefs: DEFAULT_LAYOUT_SNAP_PREFS };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "corrupt" };
  }

  const decoded = decodeLayoutSnapPrefsFromUnknown(parsed);
  if (decoded === null) return { status: "corrupt" };
  return { status: "ok", prefs: decoded };
}

// 最新を読んで 1 フィールドだけ差し替えて書き戻す（L-921）
export function writeSnapPrefs(
  storage: MapLibraryStorage,
  partial: Partial<LayoutSnapPrefs>,
): SnapPrefsWriteResult {
  const latest = readSnapPrefs(storage);
  if (latest.status !== "ok") {
    return { status: "write-error" };
  }

  const merged = mergeLayoutSnapPrefs(latest.prefs, partial);
  if (!isValidLayoutSnapPrefs(merged)) {
    return { status: "write-error" };
  }

  try {
    storage.setItem(LAYOUT_SNAP_STORAGE_KEY, encodeLayoutSnapPrefs(merged));
    return { status: "ok" };
  } catch (error) {
    return {
      status: isQuotaExceededError(error) ? "quota-exceeded" : "write-error",
    };
  }
}