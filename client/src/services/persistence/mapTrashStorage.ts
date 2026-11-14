import {
  isValidMapId,
  pickUnusedMapId,
} from "@/domain/mapLibrary/mapIndex";
import {
  decodeMapTrashIndex,
  encodeMapTrashIndex,
  partitionExpiredTrashEntries,
  sortMapTrashEntriesForDisplay,
  type MapTrashIndexV1,
  type MapTrashState,
} from "@/domain/mapLibrary/mapTrash";
import type { MapDocumentResult } from "@/types/mapDocument";
import {
  isQuotaExceededError,
  type MapLibraryStorage,
} from "./mapLibraryStorage";

export const MAP_TRASH_INDEX_KEY = "draw-my-map.trash.v1";
export const MAP_TRASH_BODY_KEY_PREFIX = "draw-my-map.trash.v1.doc.";

const READ_ERROR = "ブラウザの保存データを読み取れませんでした。";

type TrashIndexReadResult =
  | { kind: "empty" }
  | { kind: "ok"; index: MapTrashIndexV1; raw: string; repaired: boolean }
  | { kind: "corrupt"; raw: string }
  | { kind: "unavailable" };

type TrashWriteResult =
  | { ok: true }
  | { ok: false; quotaExceeded: boolean };

export function mapTrashBodyKey(trashId: string): string {
  return `${MAP_TRASH_BODY_KEY_PREFIX}${trashId}`;
}

function trySetTrashItem(
  storage: MapLibraryStorage,
  key: string,
  value: string,
): TrashWriteResult {
  try {
    storage.setItem(key, value);
    return { ok: true };
  } catch (error) {
    return { ok: false, quotaExceeded: isQuotaExceededError(error) };
  }
}

function tryRemoveTrashItem(
  storage: MapLibraryStorage,
  key: string,
): boolean {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function readMapTrashIndex(
  storage: MapLibraryStorage,
): TrashIndexReadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(MAP_TRASH_INDEX_KEY);
  } catch {
    return { kind: "unavailable" };
  }
  if (raw === null) {
    return { kind: "empty" };
  }
  const decoded = decodeMapTrashIndex(raw);
  if (decoded.kind === "corrupt") {
    return { kind: "corrupt", raw };
  }
  return {
    kind: "ok",
    index: decoded.index,
    raw,
    repaired: decoded.repaired,
  };
}

export function readMapTrashState(storage: MapLibraryStorage): MapTrashState {
  const result = readMapTrashIndex(storage);
  switch (result.kind) {
    case "empty":
      return { status: "ok", entries: [] };
    case "ok":
      return {
        status: "ok",
        entries: sortMapTrashEntriesForDisplay(result.index.items),
      };
    case "corrupt":
    case "unavailable":
      return { status: "corrupt" };
  }
}

export function writeMapTrashIndex(
  storage: MapLibraryStorage,
  index: MapTrashIndexV1,
): TrashWriteResult {
  return trySetTrashItem(
    storage,
    MAP_TRASH_INDEX_KEY,
    encodeMapTrashIndex(index),
  );
}

export function removeMapTrashIndex(storage: MapLibraryStorage): boolean {
  return tryRemoveTrashItem(storage, MAP_TRASH_INDEX_KEY);
}

export function readTrashBody(
  storage: MapLibraryStorage,
  trashId: string,
): MapDocumentResult<string | null> {
  try {
    return { ok: true, value: storage.getItem(mapTrashBodyKey(trashId)) };
  } catch {
    return { ok: false, error: READ_ERROR };
  }
}

export function writeTrashBody(
  storage: MapLibraryStorage,
  trashId: string,
  json: string,
): TrashWriteResult {
  return trySetTrashItem(storage, mapTrashBodyKey(trashId), json);
}

export function removeTrashBody(
  storage: MapLibraryStorage,
  trashId: string,
): boolean {
  return tryRemoveTrashItem(storage, mapTrashBodyKey(trashId));
}

/**
 * ゴミ箱エントリ ID を決定する。preferredId が未使用なら再利用し、衝突・読取失敗時は新しく採番する。
 */
export function pickTrashId(
  storage: MapLibraryStorage,
  trashIndex: MapTrashIndexV1,
  preferredId: string,
  generateId: () => string,
): string | null {
  const usedIds = new Set(trashIndex.items.map((item) => item.id));
  const isUsed = (id: string): boolean => {
    if (usedIds.has(id)) {
      return true;
    }
    const body = readTrashBody(storage, id);
    // 読み取り失敗時も衝突とみなして既存データの保護を優先する
    return !body.ok || body.value !== null;
  };

  if (isValidMapId(preferredId) && !isUsed(preferredId)) {
    return preferredId;
  }
  return pickUnusedMapId(generateId, isUsed);
}

type PurgeExpiredTrashResult =
  | {
      status: "ok";
      state: Extract<MapTrashState, { status: "ok" }>;
      index: MapTrashIndexV1;
      raw: string | null;
    }
  | {
      status: "corrupt";
      state: Extract<MapTrashState, { status: "corrupt" }>;
    };

/**
 * 期限切れのゴミ箱エントリおよび本体を清掃し、現在のゴミ箱状態とインデックスを返す。
 */
export function purgeExpiredTrashWithIndex(
  storage: MapLibraryStorage,
  now: Date,
): PurgeExpiredTrashResult {
  const read = readMapTrashIndex(storage);
  if (read.kind === "empty") {
    return {
      status: "ok",
      state: { status: "ok", entries: [] },
      index: { version: 1, items: [] },
      raw: null,
    };
  }
  if (read.kind === "corrupt" || read.kind === "unavailable") {
    return { status: "corrupt", state: { status: "corrupt" } };
  }

  const { active, expired } = partitionExpiredTrashEntries(
    read.index.items,
    now,
  );
  if (expired.length === 0 && !read.repaired) {
    return {
      status: "ok",
      state: {
        status: "ok",
        entries: sortMapTrashEntriesForDisplay(read.index.items),
      },
      index: read.index,
      raw: read.raw,
    };
  }

  for (const entry of expired) {
    if (entry.hasBody) {
      removeTrashBody(storage, entry.id);
    }
  }

  if (active.length === 0) {
    const removed = removeMapTrashIndex(storage);
    return {
      status: "ok",
      state: { status: "ok", entries: [] },
      index: removed ? { version: 1, items: [] } : read.index,
      raw: removed ? null : read.raw,
    };
  }

  const nextIndex: MapTrashIndexV1 = { version: 1, items: active };
  const written = writeMapTrashIndex(storage, nextIndex).ok;
  return {
    status: "ok",
    state: {
      status: "ok",
      entries: sortMapTrashEntriesForDisplay(active),
    },
    index: written ? nextIndex : read.index,
    raw: written ? encodeMapTrashIndex(nextIndex) : read.raw,
  };
}

/**
 * 期限切れのゴミ箱エントリおよび本体を清掃し、現在のゴミ箱状態を返す。
 */
export function purgeExpiredTrash(
  storage: MapLibraryStorage,
  now: Date,
): MapTrashState {
  return purgeExpiredTrashWithIndex(storage, now).state;
}

/**
 * ストレージ内のゴミ箱本体キーをすべて収集する。列挙中の読み取り失敗時は null を返す。
 */
export function collectTrashBodyKeys(
  storage: MapLibraryStorage,
): string[] | null {
  // removeItem 中に storage のキー添字がずれるため、先に削除対象キーを収集する
  const bodyKeys: string[] = [];
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key !== null && key.startsWith(MAP_TRASH_BODY_KEY_PREFIX)) {
        bodyKeys.push(key);
      }
    }
  } catch {
    return null;
  }
  return bodyKeys;
}

/**
 * 破損したゴミ箱の本体キー群とインデックスをすべて強制削除する。
 */
export function forceClearCorruptTrash(
  storage: MapLibraryStorage,
): { ok: true } | { ok: false; removedAny: boolean } {
  const bodyKeys = collectTrashBodyKeys(storage);
  if (bodyKeys === null) {
    return { ok: false, removedAny: false };
  }

  let removedAny = false;
  let allBodiesRemoved = true;
  for (const key of bodyKeys) {
    if (tryRemoveTrashItem(storage, key)) {
      removedAny = true;
    } else {
      allBodiesRemoved = false;
    }
  }

  if (!allBodiesRemoved) {
    return { ok: false, removedAny };
  }

  if (!removeMapTrashIndex(storage)) {
    return { ok: false, removedAny };
  }

  return { ok: true };
}
