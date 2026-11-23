import {
  buildMapUserMeta,
  cloneMapMeta,
  isValidMapFolderId,
  mapFolderNameKey,
  MAX_MAP_FOLDERS,
  pickUnusedMapFolderId,
  setOwnMapUserMeta,
  type MapFolder,
  type MapLibraryMetaV1,
  type MapUserMeta,
  type MergeLibraryMetaForRestoreResult,
} from "./mapLibraryMetaModel";

function mergeBackupFolders(
  existingFolders: readonly MapFolder[],
  backupFolders: readonly MapFolder[],
  generateId: () => string,
): {
  readonly folders: MapFolder[];
  readonly folderIdMapping: Map<string, string>;
  readonly droppedFolderCount: number;
} {
  const nextFolders: MapFolder[] = [...existingFolders];
  const usedFolderIds = new Set(nextFolders.map((folder) => folder.id));
  const nameKeyToFolderId = new Map(
    nextFolders.map((folder) => [mapFolderNameKey(folder.name), folder.id]),
  );
  const folderIdMapping = new Map<string, string>();
  let droppedFolderCount = 0;

  for (const backupFolder of backupFolders) {
    const nameKey = mapFolderNameKey(backupFolder.name);
    const matchedId = nameKeyToFolderId.get(nameKey);
    if (matchedId !== undefined) {
      folderIdMapping.set(backupFolder.id, matchedId);
      continue;
    }
    if (nextFolders.length >= MAX_MAP_FOLDERS) {
      droppedFolderCount += 1;
      continue;
    }
    let resolvedId: string;
    if (!usedFolderIds.has(backupFolder.id) && isValidMapFolderId(backupFolder.id)) {
      resolvedId = backupFolder.id;
    } else {
      const generated = pickUnusedMapFolderId(usedFolderIds, generateId);
      if (generated === null) {
        droppedFolderCount += 1;
        continue;
      }
      resolvedId = generated;
    }
    nextFolders.push({
      id: resolvedId,
      name: backupFolder.name,
      createdAt: backupFolder.createdAt,
      updatedAt: backupFolder.updatedAt,
    });
    usedFolderIds.add(resolvedId);
    nameKeyToFolderId.set(nameKey, resolvedId);
    folderIdMapping.set(backupFolder.id, resolvedId);
  }

  return { folders: nextFolders, folderIdMapping, droppedFolderCount };
}

function mergeBackupMapMeta(
  existingMapMeta: Readonly<Record<string, MapUserMeta>>,
  backupMapMeta: Readonly<Record<string, MapUserMeta>> | undefined,
  mapIdMapping: ReadonlyMap<string, string>,
  folderIdMapping: ReadonlyMap<string, string>,
): Record<string, MapUserMeta> {
  const nextMapMeta = cloneMapMeta(existingMapMeta);
  if (backupMapMeta === undefined) {
    return nextMapMeta;
  }
  for (const oldMapId of Object.keys(backupMapMeta)) {
    const entry = backupMapMeta[oldMapId];
    const newMapId = mapIdMapping.get(oldMapId);
    if (newMapId === undefined) continue;
    const mappedFolderId =
      entry.folderId !== undefined
        ? folderIdMapping.get(entry.folderId)
        : undefined;
    const built = buildMapUserMeta({
      favorite: entry.favorite,
      lastOpenedAt: entry.lastOpenedAt,
      folderId: mappedFolderId,
      archivedAt: entry.archivedAt,
    });
    if (built !== null) {
      setOwnMapUserMeta(nextMapMeta, newMapId, built);
    }
  }
  return nextMapMeta;
}

export function mergeLibraryMetaForRestore(
  existingMeta: MapLibraryMetaV1,
  backupFolders: readonly MapFolder[] | undefined,
  backupMapMeta: Readonly<Record<string, MapUserMeta>> | undefined,
  mapIdMapping: ReadonlyMap<string, string>,
  generateId: () => string,
): MergeLibraryMetaForRestoreResult {
  if (backupFolders === undefined && backupMapMeta === undefined) {
    return { meta: existingMeta, droppedFolderCount: 0 };
  }

  const mergedFolders = mergeBackupFolders(
    existingMeta.folders,
    backupFolders ?? [],
    generateId,
  );
  const nextMapMeta = mergeBackupMapMeta(
    existingMeta.mapMeta,
    backupMapMeta,
    mapIdMapping,
    mergedFolders.folderIdMapping,
  );

  return {
    meta: {
      version: 1,
      folders: mergedFolders.folders,
      mapMeta: nextMapMeta,
    },
    droppedFolderCount: mergedFolders.droppedFolderCount,
  };
}
