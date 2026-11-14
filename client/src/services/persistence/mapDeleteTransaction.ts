import {
  createMapIndexEntry,
  findMapEntry,
  removeMapEntry,
  replaceLastMapEntry,
  type MapIndexEntry,
  type MapIndexV1,
} from "@/domain/mapLibrary/mapIndex";
import {
  bodyRemovalFailedNotice,
  currentBodyRemovalFailedNotice,
  currentMapDeletedNotice,
  indexWriteFailedNotice,
  lastBodyRemovalFailedNotice,
  lastMapDeletedNotice,
  mapDeletedNotice,
  mapIdUnavailableNotice,
} from "@/domain/mapLibrary/mapLibraryMessages";
import { DEFAULT_MAP_NAME } from "@/domain/mapLibrary/mapName";
import {
  addTrashEntry,
  createMapTrashEntry,
  sortMapTrashEntriesForDisplay,
  type MapTrashState,
} from "@/domain/mapLibrary/mapTrash";
import {
  currentMapPermanentlyDeletedNotice,
  currentPermanentBodyRemovalFailedNotice,
  lastMapPermanentlyDeletedNotice,
  lastPermanentBodyRemovalFailedNotice,
  mapPermanentlyDeletedNotice,
  permanentBodyRemovalFailedNotice,
  trashBodyReadFailedForMoveNotice,
  trashCorruptForMoveNotice,
  trashMoveFailedNotice,
  trashMoveRollbackFailedNotice,
  trashQuotaExceededNotice,
} from "@/domain/mapLibrary/mapTrashMessages";
import { isEligibleMapBackupSnapshot } from "@/domain/persistence/mapBackupSnapshot";
import { parseMapDocumentJson } from "@/domain/persistence/mapDocumentDecoder";
import type { MapBackupSnapshot } from "@/types/mapStorageSession";
import type { OperationNotice } from "@/types/operationNotice";
import {
  hasActiveJournal,
  pickNewMapId,
  readMapBody,
  writeMapIndex,
  writeMapIndexWithQuota,
  type MapLibraryStorage,
} from "./mapLibraryStorage";
import {
  MAP_TRASH_INDEX_KEY,
  pickTrashId,
  purgeExpiredTrashWithIndex,
  readMapTrashState,
  removeMapTrashIndex,
  removeTrashBody,
  writeMapTrashIndex,
  writeTrashBody,
} from "./mapTrashStorage";
import type { TrashTransactionFailure } from "./mapTrashTransaction";

export type DeleteNotices = {
  removed: OperationNotice;
  bodyRemains: OperationNotice;
};

export type PlannedMapDeletion = {
  target: MapIndexEntry;
  isCurrent: boolean;
  nextIndex: MapIndexV1;
  nextMapName: string | null;
};

type MoveMapToTrashInput = {
  storage: MapLibraryStorage;
  index: MapIndexV1;
  id: string;
  currentMapBackupSnapshot: MapBackupSnapshot | null;
  now: Date;
  generateId: () => string;
};

type MoveMapToTrashResult =
  | {
      ok: true;
      plan: PlannedMapDeletion;
      nextTrash: MapTrashState;
      notices: DeleteNotices;
    }
  | TrashTransactionFailure;

type PermanentlyDeleteActiveMapInput = {
  storage: MapLibraryStorage;
  index: MapIndexV1;
  id: string;
  now: Date;
  generateId: () => string;
};

type PermanentlyDeleteActiveMapResult =
  | {
      ok: true;
      plan: PlannedMapDeletion;
      notices: DeleteNotices;
    }
  | TrashTransactionFailure;

function trashMoveWriteFailure(
  quotaExceeded: boolean,
  nextTrash: MapTrashState,
): TrashTransactionFailure {
  return {
    ok: false,
    notice: quotaExceeded ? trashQuotaExceededNotice() : trashMoveFailedNotice(),
    ...(quotaExceeded ? { canPermanentDelete: true } : {}),
    nextTrash,
  };
}

function buildDeleteNotices(
  mode: "trash" | "permanent",
  targetName: string,
  isCurrent: boolean,
  nextMapName: string | null,
): DeleteNotices {
  if (mode === "permanent") {
    if (!isCurrent) {
      return {
        removed: mapPermanentlyDeletedNotice(targetName),
        bodyRemains: permanentBodyRemovalFailedNotice(targetName),
      };
    }
    if (nextMapName !== null) {
      return {
        removed: currentMapPermanentlyDeletedNotice(targetName, nextMapName),
        bodyRemains: currentPermanentBodyRemovalFailedNotice(targetName, nextMapName),
      };
    }
    return {
      removed: lastMapPermanentlyDeletedNotice(targetName),
      bodyRemains: lastPermanentBodyRemovalFailedNotice(targetName),
    };
  }
  if (!isCurrent) {
    return {
      removed: mapDeletedNotice(targetName),
      bodyRemains: bodyRemovalFailedNotice(targetName),
    };
  }
  if (nextMapName !== null) {
    return {
      removed: currentMapDeletedNotice(targetName, nextMapName),
      bodyRemains: currentBodyRemovalFailedNotice(targetName, nextMapName),
    };
  }
  return {
    removed: lastMapDeletedNotice(targetName),
    bodyRemains: lastBodyRemovalFailedNotice(targetName),
  };
}

function planActiveMapDeletion(
  storage: MapLibraryStorage,
  index: MapIndexV1,
  id: string,
  deps: { generateId: () => string; now: Date },
): { ok: true; plan: PlannedMapDeletion } | TrashTransactionFailure {
  const target = findMapEntry(index, id);
  if (target === null) {
    return { ok: false, notice: indexWriteFailedNotice("マップを削除") };
  }
  const isCurrent = index.currentMapId === id;
  if (!isCurrent) {
    const next = removeMapEntry(index, id);
    if (next === null) {
      return { ok: false, notice: indexWriteFailedNotice("マップを削除") };
    }
    return {
      ok: true,
      plan: { target, isCurrent: false, nextIndex: next, nextMapName: null },
    };
  }
  if (index.maps.length > 1) {
    const next = removeMapEntry(index, id);
    const nextMap = next === null ? null : findMapEntry(next, next.currentMapId);
    if (next === null || nextMap === null) {
      return { ok: false, notice: indexWriteFailedNotice("マップを削除") };
    }
    return {
      ok: true,
      plan: { target, isCurrent: true, nextIndex: next, nextMapName: nextMap.name },
    };
  }
  // 最後の1つは、新しい「無題のマップ」に置き換えて常に1つ以上残す。本体は書かない
  const newId = pickNewMapId(storage, index, deps.generateId);
  if (newId === null) {
    return { ok: false, notice: mapIdUnavailableNotice() };
  }
  const next = replaceLastMapEntry(
    index,
    id,
    createMapIndexEntry(newId, DEFAULT_MAP_NAME, deps.now.toISOString()),
  );
  if (next === null) {
    return { ok: false, notice: indexWriteFailedNotice("マップを削除") };
  }
  return {
    ok: true,
    plan: { target, isCurrent: true, nextIndex: next, nextMapName: null },
  };
}

function resolveBodyJsonForTrashMove(
  storage: MapLibraryStorage,
  currentMapId: string,
  targetId: string,
  currentMapBackupSnapshot: MapBackupSnapshot | null,
): { ok: true; bodyJson: string | null } | TrashTransactionFailure {
  const body = readMapBody(storage, targetId);
  if (targetId === currentMapId) {
    const snap = currentMapBackupSnapshot;
    const parsed = isEligibleMapBackupSnapshot(snap) ? parseMapDocumentJson(snap.json) : null;
    if (snap !== null && parsed !== null && parsed.ok) {
      const isUneditedEmpty =
        body.ok &&
        body.value === null &&
        snap.restoreOrigin === "empty" &&
        !snap.hasSavedBodyThisMount &&
        parsed.value.nodes.length === 0 &&
        parsed.value.layoutMode === "manual";
      return { ok: true, bodyJson: isUneditedEmpty ? null : snap.json };
    }
  }
  if (!body.ok) {
    return {
      ok: false,
      notice: trashBodyReadFailedForMoveNotice(),
      canPermanentDelete: true,
    };
  }
  return { ok: true, bodyJson: body.value };
}

// ゴミ箱への書き込みを取り消す。本体の削除とインデックスの戻しがすべて成功したら true。
function rollbackTrashMoveWrite(
  storage: MapLibraryStorage,
  trashId: string,
  hasBody: boolean,
  trashIndexBeforeRaw: string | null,
): boolean {
  // 容量不足時も後続のインデックス復元が通るよう、先にゴミ箱本体を消して空きを作る
  const bodyRemoved = hasBody ? removeTrashBody(storage, trashId) : true;
  if (trashIndexBeforeRaw === null) {
    return removeMapTrashIndex(storage) && bodyRemoved;
  }
  try {
    storage.setItem(MAP_TRASH_INDEX_KEY, trashIndexBeforeRaw);
  } catch {
    return false;
  }
  return bodyRemoved;
}

/** アクティブマップをゴミ箱へ移動するトランザクション（本体 → ゴミ箱インデックス → アクティブ一覧）。 */
export function moveMapToTrash(input: MoveMapToTrashInput): MoveMapToTrashResult {
  const { storage, index, id, currentMapBackupSnapshot, now, generateId } = input;
  if (hasActiveJournal(storage)) {
    return { ok: false, notice: indexWriteFailedNotice("マップを削除") };
  }
  const planned = planActiveMapDeletion(storage, index, id, { generateId, now });
  if (!planned.ok) {
    return planned;
  }
  const { plan } = planned;
  const purged = purgeExpiredTrashWithIndex(storage, now);

  const bodyResult = resolveBodyJsonForTrashMove(
    storage,
    index.currentMapId,
    plan.target.id,
    currentMapBackupSnapshot,
  );
  if (!bodyResult.ok) {
    return { ...bodyResult, nextTrash: purged.state };
  }
  const { bodyJson } = bodyResult;

  if (purged.status === "corrupt") {
    return {
      ok: false,
      notice: trashCorruptForMoveNotice(),
      canPermanentDelete: true,
      nextTrash: { status: "corrupt" },
    };
  }
  const trashIndex = purged.index;
  const trashIndexBeforeRaw = purged.raw;

  const trashId = pickTrashId(storage, trashIndex, plan.target.id, generateId);
  if (trashId === null) {
    return { ok: false, notice: trashMoveFailedNotice(), nextTrash: purged.state };
  }

  const hasBody = bodyJson !== null;
  const trashEntry = createMapTrashEntry({
    id: trashId,
    entry: plan.target,
    deletedAt: now,
    hasBody,
  });
  const trashIndexNext = addTrashEntry(trashIndex, trashEntry);

  if (hasBody) {
    const bodyWrite = writeTrashBody(storage, trashId, bodyJson);
    if (!bodyWrite.ok) {
      return trashMoveWriteFailure(bodyWrite.quotaExceeded, purged.state);
    }
  }

  const trashIndexWrite = writeMapTrashIndex(storage, trashIndexNext);
  if (!trashIndexWrite.ok) {
    if (hasBody) {
      removeTrashBody(storage, trashId);
    }
    return trashMoveWriteFailure(trashIndexWrite.quotaExceeded, purged.state);
  }

  const activeWrite = writeMapIndexWithQuota(storage, plan.nextIndex);
  if (!activeWrite.ok) {
    const rolledBack = rollbackTrashMoveWrite(
      storage,
      trashId,
      hasBody,
      trashIndexBeforeRaw,
    );
    return {
      ok: false,
      notice: rolledBack
        ? indexWriteFailedNotice("マップを削除")
        : trashMoveRollbackFailedNotice(),
      ...(activeWrite.quotaExceeded ? { canPermanentDelete: true } : {}),
      nextTrash: readMapTrashState(storage),
    };
  }

  return {
    ok: true,
    plan,
    nextTrash: {
      status: "ok",
      entries: sortMapTrashEntriesForDisplay(trashIndexNext.items),
    },
    notices: buildDeleteNotices("trash", plan.target.name, plan.isCurrent, plan.nextMapName),
  };
}

/** ゴミ箱を経由せず、アクティブ一覧からマップを直接完全削除するトランザクション。 */
export function permanentlyDeleteActiveMapIndex(
  input: PermanentlyDeleteActiveMapInput,
): PermanentlyDeleteActiveMapResult {
  const { storage, index, id, now, generateId } = input;
  if (hasActiveJournal(storage)) {
    return { ok: false, notice: indexWriteFailedNotice("マップを削除") };
  }
  const planned = planActiveMapDeletion(storage, index, id, { generateId, now });
  if (!planned.ok) {
    return planned;
  }
  const { plan } = planned;
  if (!writeMapIndex(storage, plan.nextIndex).ok) {
    return { ok: false, notice: indexWriteFailedNotice("マップを削除") };
  }
  return {
    ok: true,
    plan,
    notices: buildDeleteNotices(
      "permanent",
      plan.target.name,
      plan.isCurrent,
      plan.nextMapName,
    ),
  };
}
