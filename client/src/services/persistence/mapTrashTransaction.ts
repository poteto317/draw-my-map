import {
  findMapEntry,
  type MapIndexEntry,
  type MapIndexV1,
} from "@/domain/mapLibrary/mapIndex";
import {
  removeTrashEntry,
  sortMapTrashEntriesForDisplay,
  type MapTrashEntry,
  type MapTrashIndexV1,
  type MapTrashState,
} from "@/domain/mapLibrary/mapTrash";
import {
  trashCorruptClearedNotice,
  trashCorruptClearFailedNotice,
  trashCorruptNotice,
  trashEmptiedNotice,
  trashEmptyFailedNotice,
  trashEmptyPartialWarningNotice,
  trashEntryNotFoundNotice,
  trashEntryPermanentlyDeletedBodyWarningNotice,
  trashEntryPermanentlyDeletedNotice,
  trashPermanentDeleteFailedNotice,
  trashRestoreBodyCorruptNotice,
  trashRestoreBodyMissingNotice,
  trashRestoreBodyReadFailedNotice,
  trashRestoredCleanupFailedNotice,
  trashRestoredNotice,
  trashRestoreIndexChangedNotice,
  trashRestoreRollbackFailedNotice,
  trashRestoreWriteFailedNotice,
} from "@/domain/mapLibrary/mapTrashMessages";
import { parseMapDocumentJsonWithVersion } from "@/domain/persistence/mapDocumentDecoder";
import type { OperationNotice } from "@/types/operationNotice";
import {
  hasActiveJournal,
  hasMapBody,
  pickNewMapId,
  readMatchingIndexRaw,
  removeMapBody,
  writeMapBody,
  writeMapIndex,
  type MapLibraryStorage,
} from "./mapLibraryStorage";
import {
  collectTrashBodyKeys,
  forceClearCorruptTrash,
  MAP_TRASH_BODY_KEY_PREFIX,
  purgeExpiredTrash,
  purgeExpiredTrashWithIndex,
  readMapTrashIndex,
  readMapTrashState,
  readTrashBody,
  removeMapTrashIndex,
  removeTrashBody,
  writeMapTrashIndex,
} from "./mapTrashStorage";

export type TrashTransactionFailure = {
  ok: false;
  notice: OperationNotice;
  canPermanentDelete?: boolean;
  nextTrash?: MapTrashState;
};

type RestoreMapFromTrashInput = {
  storage: MapLibraryStorage;
  index: MapIndexV1;
  trashId: string;
  now: Date;
  generateId: () => string;
};

type RestoreMapFromTrashResult =
  | {
      ok: true;
      nextIndex: MapIndexV1;
      nextTrash: MapTrashState;
      notice: OperationNotice;
    }
  | TrashTransactionFailure;

type PermanentlyDeleteTrashEntryInput = {
  storage: MapLibraryStorage;
  trashId: string;
  now: Date;
};

type PermanentlyDeleteTrashEntryResult =
  | {
      ok: true;
      nextTrash: MapTrashState;
      notice: OperationNotice;
    }
  | TrashTransactionFailure;

type EmptyTrashStorageResult =
  | {
      ok: true;
      nextTrash: MapTrashState;
      notice: OperationNotice;
    }
  | TrashTransactionFailure;

type ResolvedTrashActionTarget =
  | {
      ok: true;
      entry: MapTrashEntry;
      trashIndex: MapTrashIndexV1;
      purgedState: MapTrashState;
    }
  | {
      ok: false;
      notice: OperationNotice;
      nextTrash: MapTrashState;
    };

type PlannedTrashRestore = {
  entry: MapTrashEntry;
  trashIndex: MapTrashIndexV1;
  purgedState: MapTrashState;
  restoredId: string;
  bodyJson: string | null;
  activeIndexNext: MapIndexV1;
};

function persistRemainingTrashIndex(
  storage: MapLibraryStorage,
  nextIndex: MapTrashIndexV1,
): boolean {
  return nextIndex.items.length === 0
    ? removeMapTrashIndex(storage)
    : writeMapTrashIndex(storage, nextIndex).ok;
}

function resolveTrashEntryForAction(
  storage: MapLibraryStorage,
  trashId: string,
  now: Date,
): ResolvedTrashActionTarget {
  const purged = purgeExpiredTrashWithIndex(storage, now);
  if (purged.status === "corrupt") {
    return {
      ok: false,
      notice: trashCorruptNotice(),
      nextTrash: purged.state,
    };
  }
  const entry = purged.state.entries.find((item) => item.id === trashId) ?? null;
  if (entry === null) {
    return {
      ok: false,
      notice: trashEntryNotFoundNotice(),
      nextTrash: purged.state,
    };
  }
  return {
    ok: true,
    entry,
    trashIndex: purged.index,
    purgedState: purged.state,
  };
}

function readValidatedTrashRestoreBody(
  storage: MapLibraryStorage,
  entry: MapTrashEntry,
  purgedState: MapTrashState,
): { ok: true; bodyJson: string | null } | TrashTransactionFailure {
  if (!entry.hasBody) {
    return { ok: true, bodyJson: null };
  }
  const body = readTrashBody(storage, entry.id);
  if (!body.ok) {
    return {
      ok: false,
      notice: trashRestoreBodyReadFailedNotice(),
      nextTrash: purgedState,
    };
  }
  if (body.value === null) {
    return {
      ok: false,
      notice: trashRestoreBodyMissingNotice(),
      nextTrash: purgedState,
    };
  }
  if (!parseMapDocumentJsonWithVersion(body.value).ok) {
    return {
      ok: false,
      notice: trashRestoreBodyCorruptNotice(),
      nextTrash: purgedState,
    };
  }
  return { ok: true, bodyJson: body.value };
}

function planTrashRestore(
  input: RestoreMapFromTrashInput,
): { ok: true; plan: PlannedTrashRestore } | TrashTransactionFailure {
  const { storage, index, trashId, now, generateId } = input;
  if (hasActiveJournal(storage)) {
    return { ok: false, notice: trashRestoreWriteFailedNotice() };
  }
  const resolved = resolveTrashEntryForAction(storage, trashId, now);
  if (!resolved.ok) {
    return resolved;
  }
  const { entry, trashIndex, purgedState } = resolved;

  const bodyResult = readValidatedTrashRestoreBody(storage, entry, purgedState);
  if (!bodyResult.ok) {
    return bodyResult;
  }

  if (readMatchingIndexRaw(storage, index) === null) {
    return {
      ok: false,
      notice: trashRestoreIndexChangedNotice(),
      nextTrash: purgedState,
    };
  }

  const canReuseOriginalId =
    findMapEntry(index, entry.originalMapId) === null &&
    !hasMapBody(storage, entry.originalMapId);
  const restoredId = canReuseOriginalId
    ? entry.originalMapId
    : pickNewMapId(storage, index, generateId);
  if (restoredId === null) {
    return {
      ok: false,
      notice: trashRestoreWriteFailedNotice(),
      nextTrash: purgedState,
    };
  }

  const restoredEntry: MapIndexEntry = {
    id: restoredId,
    name: entry.name,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
  const activeIndexNext: MapIndexV1 = {
    ...index,
    maps: [...index.maps, restoredEntry],
  };

  return {
    ok: true,
    plan: {
      entry,
      trashIndex,
      purgedState,
      restoredId,
      bodyJson: bodyResult.bodyJson,
      activeIndexNext,
    },
  };
}

function commitTrashRestore(
  storage: MapLibraryStorage,
  plan: PlannedTrashRestore,
): RestoreMapFromTrashResult {
  const { entry, trashIndex, purgedState, restoredId, bodyJson, activeIndexNext } = plan;

  if (entry.hasBody && bodyJson !== null) {
    if (!writeMapBody(storage, restoredId, bodyJson).ok) {
      return {
        ok: false,
        notice: trashRestoreWriteFailedNotice(),
        nextTrash: purgedState,
      };
    }
  }

  if (!writeMapIndex(storage, activeIndexNext).ok) {
    if (entry.hasBody && !removeMapBody(storage, restoredId).ok) {
      return {
        ok: false,
        notice: trashRestoreRollbackFailedNotice(),
        nextTrash: purgedState,
      };
    }
    return {
      ok: false,
      notice: trashRestoreWriteFailedNotice(),
      nextTrash: purgedState,
    };
  }

  const remainingTrash = removeTrashEntry(trashIndex, entry.id);
  const trashIndexCleaned = persistRemainingTrashIndex(storage, remainingTrash);
  const trashBodyCleaned = entry.hasBody ? removeTrashBody(storage, entry.id) : true;

  if (trashIndexCleaned && trashBodyCleaned) {
    return {
      ok: true,
      nextIndex: activeIndexNext,
      nextTrash: {
        status: "ok",
        entries: sortMapTrashEntriesForDisplay(remainingTrash.items),
      },
      notice: trashRestoredNotice(entry.name),
    };
  }

  return {
    ok: true,
    nextIndex: activeIndexNext,
    nextTrash: readMapTrashState(storage),
    notice: trashRestoredCleanupFailedNotice(entry.name),
  };
}

/** ゴミ箱からマップを復元するトランザクション。 */
export function restoreMapFromTrash(
  input: RestoreMapFromTrashInput,
): RestoreMapFromTrashResult {
  const planned = planTrashRestore(input);
  if (!planned.ok) {
    return planned;
  }
  return commitTrashRestore(input.storage, planned.plan);
}

/** ゴミ箱内の指定エントリを完全削除するトランザクション。 */
export function permanentlyDeleteTrashEntry(
  input: PermanentlyDeleteTrashEntryInput,
): PermanentlyDeleteTrashEntryResult {
  const { storage, trashId, now } = input;
  if (hasActiveJournal(storage)) {
    return { ok: false, notice: trashPermanentDeleteFailedNotice() };
  }
  const resolved = resolveTrashEntryForAction(storage, trashId, now);
  if (!resolved.ok) {
    return resolved;
  }
  const { entry, trashIndex, purgedState } = resolved;

  const nextIndex = removeTrashEntry(trashIndex, trashId);
  const indexUpdated = persistRemainingTrashIndex(storage, nextIndex);
  if (!indexUpdated) {
    return {
      ok: false,
      notice: trashPermanentDeleteFailedNotice(),
      nextTrash: purgedState,
    };
  }

  const bodyRemoved = entry.hasBody ? removeTrashBody(storage, trashId) : true;
  return {
    ok: true,
    nextTrash: {
      status: "ok",
      entries: sortMapTrashEntriesForDisplay(nextIndex.items),
    },
    notice: bodyRemoved
      ? trashEntryPermanentlyDeletedNotice(entry.name)
      : trashEntryPermanentlyDeletedBodyWarningNotice(entry.name),
  };
}

function emptyCorruptTrashStorage(
  storage: MapLibraryStorage,
  currentTrashStatus: MapTrashState["status"],
): EmptyTrashStorageResult {
  if (currentTrashStatus !== "corrupt") {
    return {
      ok: false,
      notice: trashCorruptNotice(),
      nextTrash: { status: "corrupt" },
    };
  }
  const cleared = forceClearCorruptTrash(storage);
  return cleared.ok
    ? {
        ok: true,
        notice: trashCorruptClearedNotice(),
        nextTrash: { status: "ok", entries: [] },
      }
    : {
        ok: false,
        notice: trashCorruptClearFailedNotice(),
        nextTrash: readMapTrashState(storage),
      };
}

function emptyNormalTrashStorage(
  storage: MapLibraryStorage,
  items: readonly MapTrashEntry[],
  hasIndexKey: boolean,
): EmptyTrashStorageResult {
  const entryIds = new Set(items.map((item) => item.id));
  const remaining: MapTrashEntry[] = [];
  let removedAnyBody = false;
  let anyBodyFailed = false;

  for (const item of items) {
    if (!item.hasBody) {
      continue;
    }
    if (removeTrashBody(storage, item.id)) {
      removedAnyBody = true;
    } else {
      anyBodyFailed = true;
      remaining.push(item);
    }
  }

  const collectedKeys = collectTrashBodyKeys(storage);
  if (collectedKeys === null) {
    anyBodyFailed = true;
  } else {
    const orphanKeys = collectedKeys.filter(
      (key) => !entryIds.has(key.slice(MAP_TRASH_BODY_KEY_PREFIX.length)),
    );
    for (const key of orphanKeys) {
      const orphanId = key.slice(MAP_TRASH_BODY_KEY_PREFIX.length);
      if (removeTrashBody(storage, orphanId)) {
        removedAnyBody = true;
      } else {
        anyBodyFailed = true;
      }
    }
  }

  if (remaining.length === 0) {
    const indexRemoved = hasIndexKey ? removeMapTrashIndex(storage) : true;
    if (!indexRemoved || collectedKeys === null) {
      return {
        ok: false,
        notice: removedAnyBody ? trashEmptyPartialWarningNotice() : trashEmptyFailedNotice(),
        nextTrash: indexRemoved ? { status: "ok", entries: [] } : readMapTrashState(storage),
      };
    }
    return {
      ok: true,
      notice: anyBodyFailed ? trashEmptyPartialWarningNotice() : trashEmptiedNotice(),
      nextTrash: { status: "ok", entries: [] },
    };
  }

  const indexWritten = writeMapTrashIndex(storage, { version: 1, items: remaining }).ok;
  const deletedPartially =
    removedAnyBody || (indexWritten && remaining.length < items.length);
  return {
    ok: false,
    notice: deletedPartially ? trashEmptyPartialWarningNotice() : trashEmptyFailedNotice(),
    nextTrash: indexWritten
      ? { status: "ok", entries: sortMapTrashEntriesForDisplay(remaining) }
      : readMapTrashState(storage),
  };
}

/** ゴミ箱を空にするトランザクション（破損時の強制初期化を含む）。 */
export function emptyTrashStorage(
  storage: MapLibraryStorage,
  currentTrashStatus: MapTrashState["status"],
): EmptyTrashStorageResult {
  if (hasActiveJournal(storage)) {
    return { ok: false, notice: trashEmptyFailedNotice() };
  }

  const trashRead = readMapTrashIndex(storage);
  if (trashRead.kind === "corrupt" || trashRead.kind === "unavailable") {
    return emptyCorruptTrashStorage(storage, currentTrashStatus);
  }

  const items = trashRead.kind === "ok" ? trashRead.index.items : [];
  return emptyNormalTrashStorage(storage, items, trashRead.kind === "ok");
}

/** 進行中ジャーナルがなければ期限切れを清掃してゴミ箱の最新状態を返す。 */
export function refreshTrashState(
  storage: MapLibraryStorage,
  now: Date,
): MapTrashState {
  if (hasActiveJournal(storage)) {
    return readMapTrashState(storage);
  }
  return purgeExpiredTrash(storage, now);
}
