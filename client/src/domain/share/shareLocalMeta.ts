import { isPlainRecord } from "@/domain/shared/unknownRecord";

/** マップ 1 件ぶんの共有ローカルキャッシュ */
export type ShareLocalMetaValue = {
  sharedMapId: string;
  lastPublishedAt: string | null;
  linkActive: boolean;
};

/**
 * 1 マップ分の読取結果。
 * missing＝未共有。read-error＝読取失敗（未共有に倒して上書きしない）。
 */
export type ShareLocalMetaRead =
  | { status: "missing" }
  | { status: "present"; value: ShareLocalMetaValue }
  | { status: "read-error"; error: string };

/** ストレージ全体（mapId → メタ） */
export type ShareLocalMetaStoreV1 = {
  version: 1;
  byMapId: Record<string, ShareLocalMetaValue>;
};

export type DecodeShareLocalMetaStoreResult =
  | { status: "ok"; store: ShareLocalMetaStoreV1 }
  | { status: "corrupt" };

export function createEmptyShareLocalMetaStore(): ShareLocalMetaStoreV1 {
  return { version: 1, byMapId: {} };
}

function isShareLocalMetaValue(value: unknown): value is ShareLocalMetaValue {
  if (!isPlainRecord(value)) return false;
  if (typeof value.sharedMapId !== "string" || value.sharedMapId.length === 0) {
    return false;
  }
  if (value.lastPublishedAt !== null && typeof value.lastPublishedAt !== "string") {
    return false;
  }
  if (typeof value.linkActive !== "boolean") return false;
  return true;
}

export function decodeShareLocalMetaStore(
  raw: string | null,
): DecodeShareLocalMetaStoreResult {
  if (raw === null) {
    return { status: "ok", store: createEmptyShareLocalMetaStore() };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "corrupt" };
  }
  if (!isPlainRecord(parsed) || parsed.version !== 1 || !isPlainRecord(parsed.byMapId)) {
    return { status: "corrupt" };
  }
  const byMapId: Record<string, ShareLocalMetaValue> = {};
  for (const [mapId, entry] of Object.entries(parsed.byMapId)) {
    if (typeof mapId !== "string" || mapId.length === 0) {
      return { status: "corrupt" };
    }
    if (!isShareLocalMetaValue(entry)) {
      return { status: "corrupt" };
    }
    byMapId[mapId] = {
      sharedMapId: entry.sharedMapId,
      lastPublishedAt: entry.lastPublishedAt,
      linkActive: entry.linkActive,
    };
  }
  return { status: "ok", store: { version: 1, byMapId } };
}

export function encodeShareLocalMetaStore(store: ShareLocalMetaStoreV1): string {
  return JSON.stringify(store);
}

/** ストアから 1 マップ分を読む（キー欠落は missing） */
export function readShareLocalMetaForMap(
  store: ShareLocalMetaStoreV1,
  mapId: string,
): ShareLocalMetaRead {
  const value = store.byMapId[mapId];
  if (value === undefined) {
    return { status: "missing" };
  }
  return { status: "present", value };
}

export function upsertShareLocalMetaForMap(
  store: ShareLocalMetaStoreV1,
  mapId: string,
  value: ShareLocalMetaValue,
): ShareLocalMetaStoreV1 {
  return {
    version: 1,
    byMapId: {
      ...store.byMapId,
      [mapId]: value,
    },
  };
}

export function removeShareLocalMetaForMap(
  store: ShareLocalMetaStoreV1,
  mapId: string,
): ShareLocalMetaStoreV1 {
  if (store.byMapId[mapId] === undefined) {
    return store;
  }
  const { [mapId]: _removed, ...rest } = store.byMapId;
  return { version: 1, byMapId: rest };
}
