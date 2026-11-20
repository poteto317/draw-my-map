import type { LibraryBackupV1 } from "@/domain/mapLibrary/libraryBackupCodec";
import { findMapEntry } from "@/domain/mapLibrary/mapIndex";
import {
  assignMapFolder,
  createEmptyMapLibraryMeta,
  createMapFolder,
  deleteMapFolder,
  formatMapFolderFailure,
  getMapUserMeta,
  MAX_MAP_FOLDERS,
  mergeLibraryMetaForRestore,
  pickUnusedMapFolderId,
  pruneMapMetaForRemovedMap,
  recordMapOpened,
  renameMapFolder,
  toggleMapFavorite,
  validateCreateMapFolderName,
  type MapLibraryMetaStatus,
  type MapLibraryMetaV1,
} from "@/domain/mapLibrary/mapLibraryMeta";
import {
  failedOperation,
  succeededOperation,
  UNCHANGED_OPERATION_RESULT,
  type MapLibraryOperationResult,
  type PersistentLibraryState,
} from "@/hooks/mapLibraryState";
import {
  readMapLibraryMeta,
  resetMapLibraryMeta,
  writeMapLibraryMeta,
  type MapLibraryMetaWriteResult,
} from "@/services/persistence/mapLibraryMetaStorage";
import type { MapLibraryStorage } from "@/services/persistence/mapLibraryStorage";
import type { OperationNotice } from "@/types/operationNotice";

export type StartupLibraryMetaResult = {
  readonly libraryMeta: MapLibraryMetaV1;
  readonly libraryMetaStatus: MapLibraryMetaStatus;
  readonly startupNotice: OperationNotice | null;
};

export type LibraryMetaActionOutcome = {
  readonly result: MapLibraryOperationResult;
  readonly nextState?: {
    readonly libraryMeta: MapLibraryMetaV1;
    readonly libraryMetaStatus: MapLibraryMetaStatus;
  };
};

export function metaProtectedUnavailableNotice(): OperationNotice {
  return {
    kind: "error",
    message: "保護モード中は、お気に入りやフォルダー情報を変更できません。",
  };
}

function metaStatusBlockedNotice(
  status: Exclude<MapLibraryMetaStatus, "ready">,
): OperationNotice {
  if (status === "corrupt") {
    return {
      kind: "error",
      message:
        "お気に入り・フォルダー情報が破損しているため操作できません。メタデータを初期化してから再試行してください。",
    };
  }
  return {
    kind: "error",
    message: "お気に入り・フォルダー情報を読み込めなかったため操作できません。",
  };
}

function metaWriteFailedNotice(
  reason: Extract<MapLibraryMetaWriteResult, { ok: false }>["reason"],
): OperationNotice {
  if (reason === "quota") {
    return {
      kind: "error",
      message:
        "保存領域の空きが足りず、お気に入り・フォルダー情報を保存できませんでした。不要なデータを減らして再試行してください。",
    };
  }
  return {
    kind: "error",
    message: "お気に入り・フォルダー情報を保存できませんでした。再試行してください。",
  };
}

function startupMetaWriteWarningNotice(
  reason: Extract<MapLibraryMetaWriteResult, { ok: false }>["reason"],
): OperationNotice {
  if (reason === "quota") {
    return {
      kind: "warning",
      message:
        "保存領域の空きが足りず、最近使用したマップの記録を保存できませんでした。",
    };
  }
  return {
    kind: "warning",
    message: "最近使用したマップの記録を保存できませんでした。",
  };
}

// 起動時のメタデータ読み込みと初期マップの最終閲覧日時記録。
// 破損・読込不能時は自動上書きせず、書込失敗時は既存の起動通知を優先する（L-001, L-002, L-669）。
export function loadStartupLibraryMeta(
  storage: MapLibraryStorage,
  currentMapId: string,
  nowIso: string,
  existingStartupNotice: OperationNotice | null,
): StartupLibraryMetaResult {
  const read = readMapLibraryMeta(storage);
  if (!read.ok) {
    return {
      libraryMeta: createEmptyMapLibraryMeta(),
      libraryMetaStatus: read.reason === "corrupt" ? "corrupt" : "unavailable",
      startupNotice: existingStartupNotice,
    };
  }
  const nextMeta = recordMapOpened(read.meta, currentMapId, nowIso);
  const written = writeMapLibraryMeta(storage, nextMeta);
  if (!written.ok) {
    return {
      libraryMeta: read.meta,
      libraryMetaStatus: "ready",
      startupNotice: existingStartupNotice ?? startupMetaWriteWarningNotice(written.reason),
    };
  }
  return {
    libraryMeta: nextMeta,
    libraryMetaStatus: "ready",
    startupNotice: existingStartupNotice,
  };
}

// マップ切替・作成・別名保存・枝移動成功後に最終閲覧日時を保存する。
// 書込失敗や非 ready 状態でも主処理を巻き戻さない（L-001, L-575, L-669）。
export function persistMapOpenedMeta(
  current: PersistentLibraryState,
  mapId: string,
  nowIso: string,
  successNotice: OperationNotice,
  warningPrefix: string,
): { readonly libraryMeta: MapLibraryMetaV1; readonly notice: OperationNotice } {
  if (current.libraryMetaStatus !== "ready") {
    return { libraryMeta: current.libraryMeta, notice: successNotice };
  }
  const candidate = recordMapOpened(current.libraryMeta, mapId, nowIso);
  const written = writeMapLibraryMeta(current.storage, candidate);
  if (!written.ok) {
    return {
      libraryMeta: current.libraryMeta,
      notice: {
        kind: "warning",
        message: `${warningPrefix}が、最近使用したマップの記録を保存できませんでした。`,
      },
    };
  }
  return { libraryMeta: candidate, notice: successNotice };
}

// マップ削除後の掃除と次マップの最終閲覧日時更新を 1 つの nextMeta に合成して 1 回だけ保存する（L-453, L-537）。
export function persistDeletionMeta(
  current: PersistentLibraryState,
  removedMapId: string,
  nextCurrentMapId: string | null,
  nowIso: string,
  baseNotice: OperationNotice,
): { readonly libraryMeta: MapLibraryMetaV1; readonly notice: OperationNotice } {
  if (current.libraryMetaStatus !== "ready") {
    return { libraryMeta: current.libraryMeta, notice: baseNotice };
  }
  const pruned = pruneMapMetaForRemovedMap(current.libraryMeta, removedMapId);
  const candidate =
    nextCurrentMapId !== null ? recordMapOpened(pruned, nextCurrentMapId, nowIso) : pruned;
  if (candidate === current.libraryMeta) {
    return { libraryMeta: current.libraryMeta, notice: baseNotice };
  }
  const written = writeMapLibraryMeta(current.storage, candidate);
  if (!written.ok) {
    return {
      libraryMeta: current.libraryMeta,
      notice: {
        kind: "warning",
        message: `${baseNotice.message}ただし、お気に入り・フォルダー情報の更新を保存できませんでした。`,
      },
    };
  }
  return { libraryMeta: candidate, notice: baseNotice };
}

// 一括復元確定後のメタデータ統合保存。失敗や上限超過でも確定済みマップ復元は巻き戻さない（L-001, L-575, L-669）。
export function persistRestoredMeta(
  current: PersistentLibraryState,
  backup: LibraryBackupV1,
  mapIdMapping: ReadonlyMap<string, string>,
  generateId: () => string,
): { readonly libraryMeta: MapLibraryMetaV1; readonly notice: OperationNotice } {
  const defaultSuccessNotice: OperationNotice = {
    kind: "status",
    message: "バックアップのマップを追加しました。",
  };
  if (
    current.libraryMetaStatus !== "ready" ||
    (backup.folders === undefined && backup.mapMeta === undefined)
  ) {
    return { libraryMeta: current.libraryMeta, notice: defaultSuccessNotice };
  }
  const merged = mergeLibraryMetaForRestore(
    current.libraryMeta,
    backup.folders,
    backup.mapMeta,
    mapIdMapping,
    generateId,
  );
  const written = writeMapLibraryMeta(current.storage, merged.meta);
  if (!written.ok) {
    return {
      libraryMeta: current.libraryMeta,
      notice: {
        kind: "warning",
        message:
          written.reason === "quota"
            ? "バックアップのマップを追加しましたが、保存領域の空きが足りずお気に入り・フォルダー情報を保存できませんでした。"
            : "バックアップのマップを追加しましたが、お気に入り・フォルダー情報を保存できませんでした。",
      },
    };
  }
  if (merged.droppedFolderCount > 0) {
    return {
      libraryMeta: merged.meta,
      notice: {
        kind: "warning",
        message: `バックアップのマップを追加しましたが、フォルダー上限（${MAX_MAP_FOLDERS} 件）を超えた ${merged.droppedFolderCount} 件のフォルダーは未分類にしました。`,
      },
    };
  }
  return { libraryMeta: merged.meta, notice: defaultSuccessNotice };
}

function guardReadyMeta(
  current: PersistentLibraryState,
): LibraryMetaActionOutcome | null {
  if (current.libraryMetaStatus !== "ready") {
    return {
      result: failedOperation(metaStatusBlockedNotice(current.libraryMetaStatus)),
    };
  }
  return null;
}

export function runToggleFavorite(
  current: PersistentLibraryState,
  mapId: string,
): LibraryMetaActionOutcome {
  const blocked = guardReadyMeta(current);
  if (blocked !== null) return blocked;
  const target = findMapEntry(current.index, mapId);
  if (target === null) {
    return {
      result: failedOperation({ kind: "error", message: "対象のマップが見つかりませんでした。" }),
    };
  }
  const nextMeta = toggleMapFavorite(current.libraryMeta, mapId);
  const written = writeMapLibraryMeta(current.storage, nextMeta);
  if (!written.ok) {
    return { result: failedOperation(metaWriteFailedNotice(written.reason)) };
  }
  const isFavorite = getMapUserMeta(nextMeta, mapId)?.favorite === true;
  return {
    nextState: { libraryMeta: nextMeta, libraryMetaStatus: "ready" },
    result: succeededOperation(
      {
        kind: "status",
        message: isFavorite
          ? `「${target.name}」をお気に入りに追加しました。`
          : `「${target.name}」をお気に入りから外しました。`,
      },
      false,
    ),
  };
}

export function runAssignFolder(
  current: PersistentLibraryState,
  mapId: string,
  folderId: string | null,
): LibraryMetaActionOutcome {
  const blocked = guardReadyMeta(current);
  if (blocked !== null) return blocked;
  const target = findMapEntry(current.index, mapId);
  if (target === null) {
    return {
      result: failedOperation({ kind: "error", message: "対象のマップが見つかりませんでした。" }),
    };
  }
  const assigned = assignMapFolder(current.libraryMeta, mapId, folderId);
  if (!assigned.ok) {
    return {
      result: failedOperation({ kind: "error", message: formatMapFolderFailure(assigned.reason) }),
    };
  }
  const currentFolderId = getMapUserMeta(current.libraryMeta, mapId)?.folderId ?? null;
  if (currentFolderId === folderId) {
    return { result: UNCHANGED_OPERATION_RESULT };
  }
  const written = writeMapLibraryMeta(current.storage, assigned.meta);
  if (!written.ok) {
    return { result: failedOperation(metaWriteFailedNotice(written.reason)) };
  }
  const folder =
    folderId === null
      ? undefined
      : current.libraryMeta.folders.find((item) => item.id === folderId);
  return {
    nextState: { libraryMeta: assigned.meta, libraryMetaStatus: "ready" },
    result: succeededOperation(
      {
        kind: "status",
        message:
          folder === undefined
            ? `「${target.name}」を未分類に変更しました。`
            : `「${target.name}」をフォルダー「${folder.name}」に移動しました。`,
      },
      false,
    ),
  };
}

export function runCreateFolder(
  current: PersistentLibraryState,
  rawName: string,
  nowIso: string,
  generateId: () => string,
): LibraryMetaActionOutcome {
  const blocked = guardReadyMeta(current);
  if (blocked !== null) return blocked;
  const validated = validateCreateMapFolderName(current.libraryMeta.folders, rawName);
  if (!validated.ok) {
    return {
      result: failedOperation({ kind: "error", message: formatMapFolderFailure(validated.reason) }),
    };
  }
  const usedIds = new Set(current.libraryMeta.folders.map((folder) => folder.id));
  const id = pickUnusedMapFolderId(usedIds, generateId);
  if (id === null) {
    return {
      result: failedOperation({
        kind: "error",
        message: "新しいフォルダー ID を確保できませんでした。再試行してください。",
      }),
    };
  }
  const created = createMapFolder(current.libraryMeta, id, validated.name, nowIso);
  if (!created.ok) {
    return {
      result: failedOperation({ kind: "error", message: formatMapFolderFailure(created.reason) }),
    };
  }
  const written = writeMapLibraryMeta(current.storage, created.meta);
  if (!written.ok) {
    return { result: failedOperation(metaWriteFailedNotice(written.reason)) };
  }
  return {
    nextState: { libraryMeta: created.meta, libraryMetaStatus: "ready" },
    result: succeededOperation(
      { kind: "status", message: `フォルダー「${created.folder.name}」を作成しました。` },
      false,
      { folderId: created.folder.id },
    ),
  };
}

export function runRenameFolder(
  current: PersistentLibraryState,
  folderId: string,
  rawName: string,
  nowIso: string,
): LibraryMetaActionOutcome {
  const blocked = guardReadyMeta(current);
  if (blocked !== null) return blocked;
  const existing = current.libraryMeta.folders.find((folder) => folder.id === folderId);
  const renamed = renameMapFolder(current.libraryMeta, folderId, rawName, nowIso);
  if (!renamed.ok) {
    return {
      result: failedOperation({ kind: "error", message: formatMapFolderFailure(renamed.reason) }),
    };
  }
  if (existing !== undefined && existing.name === renamed.folder.name) {
    return { result: UNCHANGED_OPERATION_RESULT };
  }
  const written = writeMapLibraryMeta(current.storage, renamed.meta);
  if (!written.ok) {
    return { result: failedOperation(metaWriteFailedNotice(written.reason)) };
  }
  return {
    nextState: { libraryMeta: renamed.meta, libraryMetaStatus: "ready" },
    result: succeededOperation(
      { kind: "status", message: `フォルダー名を「${renamed.folder.name}」に変更しました。` },
      false,
    ),
  };
}

export function runDeleteFolder(
  current: PersistentLibraryState,
  folderId: string,
): LibraryMetaActionOutcome {
  const blocked = guardReadyMeta(current);
  if (blocked !== null) return blocked;
  const target = current.libraryMeta.folders.find((folder) => folder.id === folderId);
  const deleted = deleteMapFolder(current.libraryMeta, folderId);
  if (!deleted.ok) {
    return {
      result: failedOperation({ kind: "error", message: formatMapFolderFailure(deleted.reason) }),
    };
  }
  const written = writeMapLibraryMeta(current.storage, deleted.meta);
  if (!written.ok) {
    return { result: failedOperation(metaWriteFailedNotice(written.reason)) };
  }
  return {
    nextState: { libraryMeta: deleted.meta, libraryMetaStatus: "ready" },
    result: succeededOperation(
      { kind: "status", message: `フォルダー「${target?.name ?? ""}」を削除しました。` },
      false,
    ),
  };
}

// 破損時（corrupt）のみの明示的初期化。ready や unavailable では自動・誤上書きを防ぐため拒否する（L-669）。
export function runResetLibraryMeta(
  current: PersistentLibraryState,
): LibraryMetaActionOutcome {
  if (current.libraryMetaStatus !== "corrupt") {
    return {
      result: failedOperation({
        kind: "error",
        message: "メタデータの初期化は破損時のみ実行できます。",
      }),
    };
  }
  const written = resetMapLibraryMeta(current.storage);
  if (!written.ok) {
    return { result: failedOperation(metaWriteFailedNotice(written.reason)) };
  }
  return {
    nextState: {
      libraryMeta: createEmptyMapLibraryMeta(),
      libraryMetaStatus: "ready",
    },
    result: succeededOperation(
      { kind: "status", message: "お気に入り・フォルダー情報を初期化しました。" },
      false,
    ),
  };
}
