import {
  createEmptyMapLibraryMeta,
  decodeMapLibraryMeta,
  encodeMapLibraryMeta,
  type MapLibraryMetaV1,
} from "@/domain/mapLibrary/mapLibraryMeta";
import {
  isQuotaExceededError,
  type MapLibraryStorage,
} from "./mapLibraryStorage";

export const MAP_LIBRARY_META_STORAGE_KEY = "draw-my-map.library-meta.v1";

export type MapLibraryMetaReadResult =
  | {
      readonly ok: true;
      readonly meta: MapLibraryMetaV1;
      readonly repaired: boolean;
    }
  | { readonly ok: false; readonly reason: "corrupt" | "read-error" };

export type MapLibraryMetaWriteResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "quota" | "write-error" };

// メタデータを読み込む。破損と読込不能を区別し、自動上書きしない（L-002, L-056）
export function readMapLibraryMeta(
  storage: MapLibraryStorage,
): MapLibraryMetaReadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(MAP_LIBRARY_META_STORAGE_KEY);
  } catch {
    return { ok: false, reason: "read-error" };
  }
  return decodeMapLibraryMeta(raw);
}

// メタデータを保存し、容量不足とその他の書込失敗を区別して返す（L-001, L-056）
export function writeMapLibraryMeta(
  storage: MapLibraryStorage,
  meta: MapLibraryMetaV1,
): MapLibraryMetaWriteResult {
  try {
    storage.setItem(MAP_LIBRARY_META_STORAGE_KEY, encodeMapLibraryMeta(meta));
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: isQuotaExceededError(error) ? "quota" : "write-error",
    };
  }
}

// 破損時の明示的初期化用。空の MapLibraryMetaV1 で上書きして成否を返す（L-001）
export function resetMapLibraryMeta(
  storage: MapLibraryStorage,
): MapLibraryMetaWriteResult {
  return writeMapLibraryMeta(storage, createEmptyMapLibraryMeta());
}
