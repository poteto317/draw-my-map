import { hasOnlyKeys, hasOwn, isPlainRecord } from "@/domain/shared/unknownRecord";
import { isValidMapId } from "./mapIndex";
import {
  buildMapUserMeta,
  createEmptyMapLibraryMeta,
  isValidMapFolderId,
  mapFolderNameKey,
  MAX_MAP_FOLDERS,
  normalizeMapFolderName,
  setOwnMapUserMeta,
  type DecodeMapLibraryMetaResult,
  type MapFolder,
  type MapLibraryMetaV1,
  type MapUserMeta,
  type ValidateBackupLibraryMetaResult,
} from "./mapLibraryMetaModel";
import { normalizeMapTimestamp } from "./mapTimestamp";

const TOP_LEVEL_KEYS = new Set(["version", "folders", "mapMeta"]);
const FOLDER_KEYS = new Set(["id", "name", "createdAt", "updatedAt"]);
const MAP_USER_META_KEYS = new Set(["favorite", "lastOpenedAt", "folderId", "archivedAt"]);

function isStrictIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && normalizeMapTimestamp(value).repaired === false;
}

function decodeStrictFolders(
  rawFolders: unknown,
):
  | { readonly ok: true; readonly folders: MapFolder[]; readonly folderIds: Set<string> }
  | { readonly ok: false; readonly error: string } {
  if (!Array.isArray(rawFolders)) {
    return { ok: false, error: "フォルダー一覧の形式が不正です。" };
  }
  if (rawFolders.length > MAX_MAP_FOLDERS) {
    return {
      ok: false,
      error: `フォルダー数は最大 ${MAX_MAP_FOLDERS} 件までです。`,
    };
  }
  const folders: MapFolder[] = [];
  const seenIds = new Set<string>();
  const seenNameKeys = new Set<string>();
  for (const item of rawFolders) {
    if (!isPlainRecord(item) || !hasOnlyKeys(item, FOLDER_KEYS)) {
      return { ok: false, error: "フォルダー情報の形式が不正です。" };
    }
    if (!isValidMapFolderId(item.id)) {
      return { ok: false, error: "フォルダー ID が不正です。" };
    }
    if (seenIds.has(item.id)) {
      return { ok: false, error: "フォルダー ID が重複しています。" };
    }
    if (typeof item.name !== "string") {
      return { ok: false, error: "フォルダー名が不正です。" };
    }
    const normalized = normalizeMapFolderName(item.name);
    if (!normalized.ok || normalized.name !== item.name) {
      return { ok: false, error: "フォルダー名が不正です。" };
    }
    const nameKey = mapFolderNameKey(normalized.name);
    if (seenNameKeys.has(nameKey)) {
      return { ok: false, error: "フォルダー名が重複しています。" };
    }
    if (
      !isStrictIsoTimestamp(item.createdAt) ||
      !isStrictIsoTimestamp(item.updatedAt)
    ) {
      return { ok: false, error: "フォルダーの日時が不正です。" };
    }
    seenIds.add(item.id);
    seenNameKeys.add(nameKey);
    folders.push({
      id: item.id,
      name: item.name,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    });
  }
  return { ok: true, folders, folderIds: seenIds };
}

function decodeMapUserMetaEntry(
  entryValue: unknown,
  folderIds: ReadonlySet<string>,
  options: { readonly rejectMissingFolder: boolean },
):
  | { readonly ok: true; readonly entry: MapUserMeta | null; readonly repaired: boolean }
  | { readonly ok: false; readonly error: string } {
  if (!isPlainRecord(entryValue) || !hasOnlyKeys(entryValue, MAP_USER_META_KEYS)) {
    return { ok: false, error: "マップメタデータの形式が不正です。" };
  }

  let repaired = false;
  let favorite: boolean | undefined;
  if (hasOwn(entryValue, "favorite")) {
    if (typeof entryValue.favorite !== "boolean") {
      return { ok: false, error: "お気に入りフラグの形式が不正です。" };
    }
    if (entryValue.favorite) {
      favorite = true;
    } else {
      repaired = true;
    }
  }

  let lastOpenedAt: string | undefined;
  if (hasOwn(entryValue, "lastOpenedAt")) {
    if (!isStrictIsoTimestamp(entryValue.lastOpenedAt)) {
      return { ok: false, error: "最終閲覧日時の形式が不正です。" };
    }
    lastOpenedAt = entryValue.lastOpenedAt;
  }

  let folderId: string | undefined;
  if (hasOwn(entryValue, "folderId")) {
    if (!isValidMapFolderId(entryValue.folderId)) {
      return { ok: false, error: "所属フォルダー ID の形式が不正です。" };
    }
    if (folderIds.has(entryValue.folderId)) {
      folderId = entryValue.folderId;
    } else if (options.rejectMissingFolder) {
      return { ok: false, error: "存在しないフォルダーを参照しています。" };
    } else {
      repaired = true;
    }
  }

  let archivedAt: string | undefined;
  if (hasOwn(entryValue, "archivedAt")) {
    if (!isStrictIsoTimestamp(entryValue.archivedAt)) {
      return { ok: false, error: "アーカイブ日時の形式が不正です。" };
    }
    archivedAt = entryValue.archivedAt;
  }

  const built = buildMapUserMeta({ favorite, lastOpenedAt, folderId, archivedAt });
  if (built === null) {
    repaired = true;
  }
  return { ok: true, entry: built, repaired };
}

export function decodeMapLibraryMeta(
  raw: string | null,
): DecodeMapLibraryMetaResult {
  if (raw === null) {
    return { ok: true, meta: createEmptyMapLibraryMeta(), repaired: false };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "corrupt" };
  }
  if (
    !isPlainRecord(parsed) ||
    !hasOnlyKeys(parsed, TOP_LEVEL_KEYS) ||
    parsed.version !== 1 ||
    !isPlainRecord(parsed.mapMeta)
  ) {
    return { ok: false, reason: "corrupt" };
  }

  const decodedFolders = decodeStrictFolders(parsed.folders);
  if (!decodedFolders.ok) {
    return { ok: false, reason: "corrupt" };
  }

  let repaired = false;
  const mapMeta: Record<string, MapUserMeta> = {};
  for (const mapId of Object.keys(parsed.mapMeta)) {
    const entryValue = parsed.mapMeta[mapId];
    if (!isValidMapId(mapId)) {
      return { ok: false, reason: "corrupt" };
    }
    const decodedEntry = decodeMapUserMetaEntry(
      entryValue,
      decodedFolders.folderIds,
      { rejectMissingFolder: false },
    );
    if (!decodedEntry.ok) {
      return { ok: false, reason: "corrupt" };
    }
    repaired = repaired || decodedEntry.repaired;
    if (decodedEntry.entry !== null) {
      setOwnMapUserMeta(mapMeta, mapId, decodedEntry.entry);
    }
  }

  return {
    ok: true,
    meta: {
      version: 1,
      folders: decodedFolders.folders,
      mapMeta,
    },
    repaired,
  };
}

export function encodeMapLibraryMeta(meta: MapLibraryMetaV1): string {
  return JSON.stringify(meta);
}

export function validateBackupLibraryMeta(
  folders: unknown,
  mapMeta: unknown,
  validMapIds: ReadonlySet<string>,
): ValidateBackupLibraryMetaResult {
  if (folders === undefined && mapMeta === undefined) {
    return { ok: true };
  }

  let validatedFolders: MapFolder[] | undefined;
  let folderIds: ReadonlySet<string> = new Set<string>();
  if (folders !== undefined) {
    const decodedFolders = decodeStrictFolders(folders);
    if (!decodedFolders.ok) {
      return { ok: false, error: `バックアップ内の${decodedFolders.error}` };
    }
    folderIds = decodedFolders.folderIds;
    if (decodedFolders.folders.length > 0) {
      validatedFolders = decodedFolders.folders;
    }
  }

  let validatedMapMeta: Record<string, MapUserMeta> | undefined;
  if (mapMeta !== undefined) {
    if (!isPlainRecord(mapMeta)) {
      return {
        ok: false,
        error: "バックアップ内のマップメタデータの形式が不正です。",
      };
    }
    // 要素走査前に件数を先行検査する（L-443）
    const mapMetaKeys = Object.keys(mapMeta);
    if (mapMetaKeys.length > validMapIds.size) {
      return {
        ok: false,
        error: "バックアップ内のマップメタデータ件数がマップ数を超えています。",
      };
    }
    const normalizedMapMeta: Record<string, MapUserMeta> = {};
    for (const mapId of mapMetaKeys) {
      const entryValue = mapMeta[mapId];
      if (!isValidMapId(mapId) || !validMapIds.has(mapId)) {
        return {
          ok: false,
          error: "バックアップ内のマップメタデータに存在しないマップ ID が含まれています。",
        };
      }
      const decodedEntry = decodeMapUserMetaEntry(entryValue, folderIds, {
        rejectMissingFolder: true,
      });
      if (!decodedEntry.ok) {
        return { ok: false, error: `バックアップ内の${decodedEntry.error}` };
      }
      if (decodedEntry.entry !== null) {
        setOwnMapUserMeta(normalizedMapMeta, mapId, decodedEntry.entry);
      }
    }
    if (Object.keys(normalizedMapMeta).length > 0) {
      validatedMapMeta = normalizedMapMeta;
    }
  }

  return {
    ok: true,
    ...(validatedFolders !== undefined ? { folders: validatedFolders } : {}),
    ...(validatedMapMeta !== undefined ? { mapMeta: validatedMapMeta } : {}),
  };
}
