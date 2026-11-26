import {
  createEmptyShareLocalMetaStore,
  decodeShareLocalMetaStore,
  encodeShareLocalMetaStore,
  readShareLocalMetaForMap,
  removeShareLocalMetaForMap,
  upsertShareLocalMetaForMap,
  type ShareLocalMetaRead,
  type ShareLocalMetaStoreV1,
  type ShareLocalMetaValue,
} from "@/domain/share/shareLocalMeta";
import {
  isQuotaExceededError,
  type MapLibraryStorage,
} from "./mapLibraryStorage";

export const SHARE_LOCAL_META_STORAGE_KEY = "draw-my-map.share-local-meta.v1";

export type ShareLocalMetaStoreReadResult =
  | { status: "ok"; store: ShareLocalMetaStoreV1 }
  | { status: "corrupt" }
  | { status: "read-error"; error: string };

export type ShareLocalMetaWriteResult =
  | { status: "ok" }
  | { status: "quota-exceeded" }
  | { status: "write-error"; error: string };

/** ストア全体を読む。破損・読取失敗を未共有成功に倒さない（L-002） */
export function readShareLocalMetaStore(
  storage: MapLibraryStorage,
): ShareLocalMetaStoreReadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(SHARE_LOCAL_META_STORAGE_KEY);
  } catch (error) {
    return {
      status: "read-error",
      error: error instanceof Error ? error.message : "read-error",
    };
  }
  const decoded = decodeShareLocalMetaStore(raw);
  if (decoded.status === "corrupt") {
    return { status: "corrupt" };
  }
  return { status: "ok", store: decoded.store };
}

/**
 * 1 マップ分を読む。
 * ストア読取失敗・破損は read-error（呼び出し側は未共有に倒して上書きしない）。
 */
export function readShareLocalMeta(
  storage: MapLibraryStorage,
  mapId: string,
): ShareLocalMetaRead {
  const storeRead = readShareLocalMetaStore(storage);
  if (storeRead.status === "read-error") {
    return { status: "read-error", error: storeRead.error };
  }
  if (storeRead.status === "corrupt") {
    return { status: "read-error", error: "corrupt" };
  }
  return readShareLocalMetaForMap(storeRead.store, mapId);
}

export function writeShareLocalMetaStore(
  storage: MapLibraryStorage,
  store: ShareLocalMetaStoreV1,
): ShareLocalMetaWriteResult {
  try {
    storage.setItem(SHARE_LOCAL_META_STORAGE_KEY, encodeShareLocalMetaStore(store));
    return { status: "ok" };
  } catch (error) {
    if (isQuotaExceededError(error)) {
      return { status: "quota-exceeded" };
    }
    return {
      status: "write-error",
      error: error instanceof Error ? error.message : "write-error",
    };
  }
}

/**
 * 成功時だけメタを書き込む。読取失敗時は上書きしない（listState error と同型・L-002）。
 */
export function writeShareLocalMetaForMap(
  storage: MapLibraryStorage,
  mapId: string,
  value: ShareLocalMetaValue,
): ShareLocalMetaWriteResult | { status: "skipped-read-error"; error: string } {
  const storeRead = readShareLocalMetaStore(storage);
  if (storeRead.status === "read-error") {
    return { status: "skipped-read-error", error: storeRead.error };
  }
  if (storeRead.status === "corrupt") {
    return { status: "skipped-read-error", error: "corrupt" };
  }
  return writeShareLocalMetaStore(
    storage,
    upsertShareLocalMetaForMap(storeRead.store, mapId, value),
  );
}

export function clearShareLocalMetaForMap(
  storage: MapLibraryStorage,
  mapId: string,
): ShareLocalMetaWriteResult | { status: "skipped-read-error"; error: string } {
  const storeRead = readShareLocalMetaStore(storage);
  if (storeRead.status === "read-error") {
    return { status: "skipped-read-error", error: storeRead.error };
  }
  if (storeRead.status === "corrupt") {
    return { status: "skipped-read-error", error: "corrupt" };
  }
  const next = removeShareLocalMetaForMap(storeRead.store, mapId);
  if (next === storeRead.store && Object.keys(storeRead.store.byMapId).length === 0) {
    // 空ストアでキー未作成なら何もしない
    try {
      if (storage.getItem(SHARE_LOCAL_META_STORAGE_KEY) === null) {
        return { status: "ok" };
      }
    } catch (error) {
      return {
        status: "write-error",
        error: error instanceof Error ? error.message : "write-error",
      };
    }
  }
  if (Object.keys(next.byMapId).length === 0) {
    try {
      storage.removeItem(SHARE_LOCAL_META_STORAGE_KEY);
      return { status: "ok" };
    } catch (error) {
      return {
        status: "write-error",
        error: error instanceof Error ? error.message : "write-error",
      };
    }
  }
  return writeShareLocalMetaStore(storage, next);
}

/** テスト用: 空ストアを明示書込 */
export function resetShareLocalMetaStore(
  storage: MapLibraryStorage,
): ShareLocalMetaWriteResult {
  return writeShareLocalMetaStore(storage, createEmptyShareLocalMetaStore());
}
