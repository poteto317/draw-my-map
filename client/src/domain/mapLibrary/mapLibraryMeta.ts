import {
  buildMapUserMeta,
  getMapUserMeta,
  isValidMapFolderId,
  setOwnMapUserMeta,
  validateCreateMapFolderName,
  validateRenameMapFolderName,
  withUpdatedMapUserMeta,
  type AssignMapFolderResult,
  type CreateMapFolderResult,
  type DeleteMapFolderResult,
  type MapFolder,
  type MapLibraryMetaV1,
  type MapUserMeta,
  type RenameMapFolderResult,
} from "./mapLibraryMetaModel";

export {
  createEmptyMapLibraryMeta,
  formatMapFolderFailure,
  getMapUserMeta,
  isValidMapFolderId,
  MAP_FOLDER_ID_PATTERN,
  mapFolderNameKey,
  MAX_MAP_FOLDER_NAME_INPUT_LENGTH,
  MAX_MAP_FOLDER_NAME_LENGTH,
  MAX_MAP_FOLDERS,
  MAX_RECENT_MAPS,
  normalizeMapFolderName,
  pickUnusedMapFolderId,
  validateCreateMapFolderName,
  validateRenameMapFolderName,
  type AssignMapFolderResult,
  type CreateMapFolderFailureReason,
  type CreateMapFolderResult,
  type DecodeMapLibraryMetaResult,
  type DeleteMapFolderResult,
  type MapFolder,
  type MapFolderFailureReason,
  type MapFolderNameFailureReason,
  type MapFolderNameResult,
  type MapLibraryMetaStatus,
  type MapLibraryMetaV1,
  type MapListFilter,
  type MapListFolderFilter,
  type MapListTab,
  type MapUserMeta,
  type MergeLibraryMetaForRestoreResult,
  type RenameMapFolderFailureReason,
  type RenameMapFolderResult,
  type ValidateBackupLibraryMetaResult,
  type ValidateCreateMapFolderNameResult,
  type ValidateRenameMapFolderNameResult,
} from "./mapLibraryMetaModel";

export {
  decodeMapLibraryMeta,
  encodeMapLibraryMeta,
  validateBackupLibraryMeta,
} from "./mapLibraryMetaCodec";

export { mergeLibraryMetaForRestore } from "./mapLibraryMetaRestore";

export { countMapsByFolder, filterAndSortMapsForList } from "./mapLibraryMetaList";

// お気に入りをトグルする。他の既存フィールド（lastOpenedAt / folderId）は保持する（L-454）
export function toggleMapFavorite(
  meta: MapLibraryMetaV1,
  mapId: string,
): MapLibraryMetaV1 {
  const existing = getMapUserMeta(meta, mapId);
  const nextFavorite = existing?.favorite === true ? undefined : true;
  const nextEntry = buildMapUserMeta({
    favorite: nextFavorite,
    lastOpenedAt: existing?.lastOpenedAt,
    folderId: existing?.folderId,
  });
  return withUpdatedMapUserMeta(meta, mapId, nextEntry);
}

// 最終閲覧日時を更新する。現在時刻は引数で受け取り、他フィールドは保持する（L-454, L-538）
export function recordMapOpened(
  meta: MapLibraryMetaV1,
  mapId: string,
  openedAt: string,
): MapLibraryMetaV1 {
  const existing = getMapUserMeta(meta, mapId);
  const nextEntry = buildMapUserMeta({
    favorite: existing?.favorite,
    lastOpenedAt: openedAt,
    folderId: existing?.folderId,
  });
  return withUpdatedMapUserMeta(meta, mapId, nextEntry);
}

// 所属フォルダーを変更する。null は未分類化。存在しない folderId は拒否し、他フィールドは保持する（L-454）
export function assignMapFolder(
  meta: MapLibraryMetaV1,
  mapId: string,
  folderId: string | null,
): AssignMapFolderResult {
  if (
    folderId !== null &&
    !meta.folders.some((folder) => folder.id === folderId)
  ) {
    return { ok: false, reason: "folder-missing" };
  }
  const existing = getMapUserMeta(meta, mapId);
  const nextEntry = buildMapUserMeta({
    favorite: existing?.favorite,
    lastOpenedAt: existing?.lastOpenedAt,
    folderId: folderId ?? undefined,
  });
  return { ok: true, meta: withUpdatedMapUserMeta(meta, mapId, nextEntry) };
}

export function createMapFolder(
  meta: MapLibraryMetaV1,
  id: string,
  rawName: string,
  now: string,
): CreateMapFolderResult {
  if (
    !isValidMapFolderId(id) ||
    meta.folders.some((folder) => folder.id === id)
  ) {
    return { ok: false, reason: "invalid-id" };
  }
  const validated = validateCreateMapFolderName(meta.folders, rawName);
  if (!validated.ok) {
    return validated;
  }
  const folder: MapFolder = {
    id,
    name: validated.name,
    createdAt: now,
    updatedAt: now,
  };
  return {
    ok: true,
    folder,
    meta: {
      ...meta,
      folders: [...meta.folders, folder],
    },
  };
}

export function renameMapFolder(
  meta: MapLibraryMetaV1,
  folderId: string,
  rawName: string,
  now: string,
): RenameMapFolderResult {
  const target = meta.folders.find((folder) => folder.id === folderId);
  if (target === undefined) {
    return { ok: false, reason: "folder-missing" };
  }
  const validated = validateRenameMapFolderName(meta.folders, folderId, rawName);
  if (!validated.ok) {
    return validated;
  }
  const updatedFolder: MapFolder = {
    ...target,
    name: validated.name,
    updatedAt: now,
  };
  return {
    ok: true,
    folder: updatedFolder,
    meta: {
      ...meta,
      folders: meta.folders.map((folder) =>
        folder.id === folderId ? updatedFolder : folder,
      ),
    },
  };
}

// フォルダーを削除し、そのフォルダーを参照していた mapMeta から folderId のみを除去する
export function deleteMapFolder(
  meta: MapLibraryMetaV1,
  folderId: string,
): DeleteMapFolderResult {
  if (!meta.folders.some((folder) => folder.id === folderId)) {
    return { ok: false, reason: "folder-missing" };
  }
  const nextFolders = meta.folders.filter((folder) => folder.id !== folderId);
  const nextMapMeta: Record<string, MapUserMeta> = {};
  for (const mapId of Object.keys(meta.mapMeta)) {
    const entry = meta.mapMeta[mapId];
    if (entry.folderId !== folderId) {
      setOwnMapUserMeta(nextMapMeta, mapId, entry);
      continue;
    }
    const rebuilt = buildMapUserMeta({
      favorite: entry.favorite,
      lastOpenedAt: entry.lastOpenedAt,
      folderId: undefined,
    });
    if (rebuilt !== null) {
      setOwnMapUserMeta(nextMapMeta, mapId, rebuilt);
    }
  }
  return {
    ok: true,
    meta: {
      ...meta,
      folders: nextFolders,
      mapMeta: nextMapMeta,
    },
  };
}

export function pruneMapMetaForRemovedMap(
  meta: MapLibraryMetaV1,
  mapId: string,
): MapLibraryMetaV1 {
  if (getMapUserMeta(meta, mapId) === undefined) {
    return meta;
  }
  return withUpdatedMapUserMeta(meta, mapId, null);
}
