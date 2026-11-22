import {
  decodePartsStore,
  encodePartsStore,
} from "@/domain/parts/partsCodec";
import type { PartsStore } from "@/domain/parts/partsModel";
import {
  isQuotaExceededError,
  type MapLibraryStorage,
} from "./mapLibraryStorage";

export const PARTS_STORAGE_KEY = "draw-my-map.parts.v1";

export type PartsReadResult =
  | { readonly status: "ok"; readonly store: PartsStore; readonly repaired: boolean }
  | { readonly status: "corrupt" }
  | { readonly status: "read-error" };

export type PartsWriteResult =
  | { readonly status: "ok" }
  | { readonly status: "quota-exceeded" }
  | { readonly status: "write-error" };

// 部品ストアを読む。破損・読取不能・空を区別し、失敗を空成功にしない（L-002）
export function readParts(storage: MapLibraryStorage): PartsReadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(PARTS_STORAGE_KEY);
  } catch {
    return { status: "read-error" };
  }
  return decodePartsStore(raw);
}

export function writeParts(
  storage: MapLibraryStorage,
  store: PartsStore,
): PartsWriteResult {
  try {
    storage.setItem(PARTS_STORAGE_KEY, encodePartsStore(store));
    return { status: "ok" };
  } catch (error) {
    return {
      status: isQuotaExceededError(error) ? "quota-exceeded" : "write-error",
    };
  }
}
