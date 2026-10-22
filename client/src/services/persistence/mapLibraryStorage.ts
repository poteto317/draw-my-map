import {
  encodeMapIndex,
  isValidMapId,
  type MapIndexV1,
} from "@/domain/mapLibrary/mapIndex";
import type { MapLibraryStartupSnapshot } from "@/domain/mapLibrary/mapLibraryStartup";
import type { MapDocumentResult } from "@/types/mapDocument";
import {
  readStoredMapJson,
  removeStoredMapJson,
  restoreStoredMapJson,
} from "./mapStorage";

export const MAP_INDEX_STORAGE_KEY = "draw-my-map.maps.v1";
export const MAP_BODY_KEY_PREFIX = "draw-my-map.maps.v1.doc.";
export const MAP_INDEX_BACKUP_STORAGE_KEY =
  "draw-my-map.maps.v1.corrupt-backup";

export type MapLibraryStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem" | "key" | "length"
>;

export type StorageWriteResult = { ok: true } | { ok: false; error: string };

// legacy: やり直しで旧キーが最後にどうなったか。
//   kept = 消せなかった（変わっていない）、restored = 元の文字列で書き戻した、lost = 書き戻せず無い。
// bodyRollback: やり直しで書いた本体を消したか。notNeeded = 本体を書けていない。
export type MigrationWriteResult =
  | { ok: true; legacy: "kept" }
  | { ok: true; legacy: "removed" }
  | { ok: false; failedStep: "body" }
  | { ok: false; failedStep: "index"; rollback: "removed" | "failed" }
  | {
      ok: false;
      failedStep: "retry";
      legacy: "kept" | "restored" | "lost";
      bodyRollback: "notNeeded" | "removed" | "failed";
    };

export type MigrationWriteInput = {
  bodyId: string;
  bodyJson: string;
  // 旧キーを残したまま書くインデックス（P: true）
  index: MapIndexV1;
  // 旧キーを消してやり直したときに書くインデックス（P: false）
  retryIndex: MapIndexV1;
  // 旧キーの元の文字列。やり直しが失敗したときに書き戻す
  legacyRaw: string;
};

const WRITE_ERROR = "ブラウザへ保存できませんでした。";
const REMOVE_ERROR = "ブラウザの保存データを削除できませんでした。";
const READ_ERROR = "ブラウザの保存データを読み取れませんでした。";

// 本体のキーを作る唯一の場所。id は isValidMapId の形式なので区切り文字は含まない。
export function mapBodyKey(id: string): string {
  return `${MAP_BODY_KEY_PREFIX}${id}`;
}

export function getBrowserMapLibraryStorage(): MapLibraryStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readMapLibrarySnapshot(
  storage: MapLibraryStorage | null,
): MapLibraryStartupSnapshot {
  if (storage === null) {
    return { kind: "unavailable" };
  }
  try {
    const indexRaw = storage.getItem(MAP_INDEX_STORAGE_KEY);
    const legacy = readStoredMapJson(storage);
    if (!legacy.ok) {
      return { kind: "unavailable" };
    }
    const bodyIds: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key === null || !key.startsWith(MAP_BODY_KEY_PREFIX)) {
        continue;
      }
      const id = key.slice(MAP_BODY_KEY_PREFIX.length);
      if (isValidMapId(id)) {
        bodyIds.push(id);
      }
    }
    return {
      kind: "available",
      indexRaw,
      legacyRaw: legacy.value,
      bodyIds,
    };
  } catch {
    return { kind: "unavailable" };
  }
}

// DOMException の name か code で容量不足を見分ける。code 22 は QuotaExceededError の旧来の値、
// NS_ERROR_DOM_QUOTA_REACHED（code 1014）は古い Firefox の容量不足。
function isQuotaExceededError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" ||
      error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      error.code === 22 ||
      error.code === 1014)
  );
}

type SetItemOutcome = "ok" | "quotaExceeded" | "failed";

function trySetItem(
  storage: MapLibraryStorage,
  key: string,
  value: string,
): SetItemOutcome {
  try {
    storage.setItem(key, value);
    return "ok";
  } catch (error) {
    return isQuotaExceededError(error) ? "quotaExceeded" : "failed";
  }
}

function setItemSafely(
  storage: MapLibraryStorage,
  key: string,
  value: string,
): StorageWriteResult {
  return trySetItem(storage, key, value) === "ok"
    ? { ok: true }
    : { ok: false, error: WRITE_ERROR };
}

export function writeMapIndex(
  storage: MapLibraryStorage,
  index: MapIndexV1,
): StorageWriteResult {
  return setItemSafely(storage, MAP_INDEX_STORAGE_KEY, encodeMapIndex(index));
}

export function readMapBody(
  storage: MapLibraryStorage,
  id: string,
): MapDocumentResult<string | null> {
  try {
    return { ok: true, value: storage.getItem(mapBodyKey(id)) };
  } catch {
    return { ok: false, error: READ_ERROR };
  }
}

export function writeMapBody(
  storage: MapLibraryStorage,
  id: string,
  json: string,
): StorageWriteResult {
  return setItemSafely(storage, mapBodyKey(id), json);
}

export function removeMapBody(
  storage: MapLibraryStorage,
  id: string,
): StorageWriteResult {
  try {
    storage.removeItem(mapBodyKey(id));
    return { ok: true };
  } catch {
    return { ok: false, error: REMOVE_ERROR };
  }
}

// 読み取りに失敗したときは、使用済みとして扱い、id の衝突を避ける。
export function hasMapBody(storage: MapLibraryStorage, id: string): boolean {
  const body = readMapBody(storage, id);
  return !body.ok || body.value !== null;
}

export function writeCorruptIndexBackup(
  storage: MapLibraryStorage,
  raw: string,
): StorageWriteResult {
  return setItemSafely(storage, MAP_INDEX_BACKUP_STORAGE_KEY, raw);
}

export function removeLegacyMap(
  storage: MapLibraryStorage,
): StorageWriteResult {
  const result = removeStoredMapJson(storage);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

// 本体 → インデックスの順に書く。インデックスの失敗では本体を戻し、戻す操作の成否も返す。
// 本体かインデックスの書き込みが容量不足で失敗したときだけ、旧キーを1回分残す方針の例外として
// 「旧キーを消す → 本体 → インデックス（P: false）」の順でやり直す（retryMigrationWithoutLegacy）。
// インデックスの容量不足では、書いた本体を先に消してからやり直す。消せなければやり直さない。
export function writeMigratedMap(
  storage: MapLibraryStorage,
  input: MigrationWriteInput,
): MigrationWriteResult {
  const body = trySetItem(storage, mapBodyKey(input.bodyId), input.bodyJson);
  if (body === "quotaExceeded") {
    return retryMigrationWithoutLegacy(storage, input);
  }
  if (body === "failed") {
    return { ok: false, failedStep: "body" };
  }
  const index = trySetItem(storage, MAP_INDEX_STORAGE_KEY, encodeMapIndex(input.index));
  if (index === "ok") {
    return { ok: true, legacy: "kept" };
  }
  const rollback = removeMapBody(storage, input.bodyId);
  if (index === "quotaExceeded" && rollback.ok) {
    return retryMigrationWithoutLegacy(storage, input);
  }
  return {
    ok: false,
    failedStep: "index",
    rollback: rollback.ok ? "removed" : "failed",
  };
}

// 旧キーは書き込み前に legacyRaw の文字列で存在していたので、戻す操作は書き戻し。
// 本体キーは書き込み前に無かった（id の生成時に確認済み）ので、戻す操作は removeItem。
// 本体を先に消してから旧キーを書き戻し、書き戻しに要る容量を空ける。
function retryMigrationWithoutLegacy(
  storage: MapLibraryStorage,
  input: MigrationWriteInput,
): MigrationWriteResult {
  if (!removeLegacyMap(storage).ok) {
    return {
      ok: false,
      failedStep: "retry",
      legacy: "kept",
      bodyRollback: "notNeeded",
    };
  }
  let bodyRollback: "notNeeded" | "removed" | "failed" = "notNeeded";
  if (writeMapBody(storage, input.bodyId, input.bodyJson).ok) {
    if (writeMapIndex(storage, input.retryIndex).ok) {
      return { ok: true, legacy: "removed" };
    }
    bodyRollback = removeMapBody(storage, input.bodyId).ok ? "removed" : "failed";
  }
  const restored = restoreStoredMapJson(storage, input.legacyRaw).ok;
  return {
    ok: false,
    failedStep: "retry",
    legacy: restored ? "restored" : "lost",
    bodyRollback,
  };
}
