"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  autoSaveFailedNotice,
  branchMovedToMapNotice,
  branchMoveFlushFailedNotice,
  branchMoveRejectedNotice,
  createFlushFailedNotice,
  indexWriteFailedNotice,
  mapCreatedNotice,
  mapIdUnavailableNotice,
  mapRenamedNotice,
  mapSwitchedNotice,
  switchFlushFailedNotice,
} from "@/domain/mapLibrary/mapLibraryMessages";
import {
  conflictBranchMoveRejectedNotice,
  conflictRestoreRejectedNotice,
  conflictSwitchMapRejectedNotice,
} from "@/domain/mapLibrary/mapConflictMessages";
import {
  addMapEntry,
  createMapIndexEntry,
  findMapEntry,
  renameMapEntry,
  setCurrentMap,
  type MapIndexV1,
} from "@/domain/mapLibrary/mapIndex";
import type { MapTrashState } from "@/domain/mapLibrary/mapTrash";
import {
  trashEmptyFailedNotice,
  trashPermanentDeleteFailedNotice,
  trashRestoreWriteFailedNotice,
} from "@/domain/mapLibrary/mapTrashMessages";
import { validateMapNameInput } from "@/domain/mapLibrary/mapName";
import {
  createPersistentMapSession,
  flushRegisteredSession,
  type BackupSnapshotRegistration,
  type FlushRegistration,
} from "@/hooks/mapLibrarySession";
import {
  failedOperation,
  failedPermanentDeleteOperation,
  isActiveBranchMoveSource,
  isSameTrashState,
  protectedModeFailure,
  succeededOperation,
  toMapLibraryView,
  UNCHANGED_OPERATION_RESULT,
  type LibraryState,
  type MapLibraryOperationResult,
  type MapLibraryView,
  type PersistentLibraryState,
  type LibraryRestorePreview,
} from "@/hooks/mapLibraryState";
import {
  pickNewMapId,
  readMatchingIndexRaw,
  removeMapBody,
  writeMapBody,
  writeMapIndex,
  type MapLibraryStorage,
} from "@/services/persistence/mapLibraryStorage";
import { readMapTrashState } from "@/services/persistence/mapTrashStorage";
import {
  moveMapToTrash,
  permanentlyDeleteActiveMapIndex,
  type DeleteNotices,
  type PlannedMapDeletion,
} from "@/services/persistence/mapDeleteTransaction";
import {
  emptyTrashStorage,
  permanentlyDeleteTrashEntry,
  refreshTrashState,
  restoreMapFromTrash,
  type TrashTransactionFailure,
} from "@/services/persistence/mapTrashTransaction";
import { downloadLibraryBackup, readLibraryBackupFile } from "@/services/persistence/libraryBackupFile";
import {
  isLibraryBackupPreviewCurrent,
  prepareLibraryBackup,
  type LibraryBackupPreview,
} from "@/services/persistence/libraryBackupExport";
import { planLibraryRestore, writeLibraryRestore } from "@/services/persistence/libraryRestoreTransaction";
import { parseMapDocumentJson } from "@/domain/persistence/mapDocumentDecoder";
import { isEligibleMapBackupSnapshot } from "@/domain/persistence/mapBackupSnapshot";
import {
  runMapLibraryStartup,
  type MapLibraryStartupResult,
} from "@/services/persistence/mapLibraryStartupRunner";
import { readBranchMoveIndex, transferStoredBranch } from "@/services/persistence/mapBranchTransfer";
import { createProtectedStorageSession } from "@/services/persistence/protectedStorageSession";
import type { MapFlushResult, MapStorageSession } from "@/types/mapStorageSession";
import type { MapDocumentResult } from "@/types/mapDocument";
import type { OperationNotice } from "@/types/operationNotice";

// 表示用の値と操作の結果の型は mapLibraryState が定義する。既存の import 先を保つため再エクスポートする
export type { LibraryRestorePreview, MapLibraryOperationResult, MapLibraryView } from "@/hooks/mapLibraryState";

export type MapLibraryDeps = {
  getStorage: () => MapLibraryStorage | null;
  now: () => Date;
  generateId: () => string;
};

export type UseMapLibraryResult = {
  view: MapLibraryView;
  createMap: (nameInput: string) => MapLibraryOperationResult;
  switchMap: (id: string) => MapLibraryOperationResult;
  renameMap: (id: string, nameInput: string) => MapLibraryOperationResult;
  deleteMap: (id: string) => MapLibraryOperationResult;
  permanentlyDeleteMap: (id: string) => MapLibraryOperationResult;
  refreshTrash: () => void;
  restoreFromTrash: (trashId: string) => MapLibraryOperationResult;
  permanentlyDeleteFromTrash: (trashId: string) => MapLibraryOperationResult;
  emptyTrash: () => MapLibraryOperationResult;
  moveBranchToMap: (sourceSession: MapStorageSession, targetId: string, rootId: number) => MapLibraryOperationResult;
  prepareBackup: () => MapDocumentResult<LibraryBackupPreview>;
  downloadBackup: (preview: LibraryBackupPreview) => MapLibraryOperationResult;
  previewRestore: (file: File) => Promise<MapDocumentResult<LibraryRestorePreview>>;
  confirmRestore: (preview: LibraryRestorePreview) => MapLibraryOperationResult;
  saveCurrentAsNewMap: (nameInput: string, snapshotJson: string) => MapLibraryOperationResult;
};

const BACKUP_RETRY = "マップ一覧を開き直して、バックアップを再試行してください。";
const RESTORE_RETRY = "マップ一覧が変わりました。バックアップからの復元を確認し直してください。";
const RESTORE_FLUSH_FAILED = "現在のマップを保存できませんでした。保存してから復元を再試行してください。";

function operationError(message: string): MapLibraryOperationResult {
  return failedOperation({ kind: "error", message });
}

function toFailedOperationResult(failure: TrashTransactionFailure): MapLibraryOperationResult {
  return failure.canPermanentDelete
    ? failedPermanentDeleteOperation(failure.notice)
    : failedOperation(failure.notice);
}

export function useMapLibrary(deps: MapLibraryDeps): UseMapLibraryResult {
  const [library, setLibrary] = useState<LibraryState | null>(null);
  const startupRef = useRef<MapLibraryStartupResult | null>(null);
  const storageRef = useRef<MapLibraryStorage | null>(null);
  // 操作とセッションは ref だけを読むので、コミット後の値を layout effect で同期し、
  // 操作の中で次の値を計算したときにも書き換える（L-453、L-468、L-521）
  const depsRef = useRef(deps);
  const libraryRef = useRef<LibraryState | null>(null);
  // セッション番号の正本。進めるのは advanceSessionNumber だけで、state には写さない
  const sessionNumberRef = useRef(0);
  const flushRef = useRef<FlushRegistration | null>(null);
  const backupSnapshotRef = useRef<BackupSnapshotRegistration | null>(null);
  const revisionRef = useRef(0);
  const restoreLockRef = useRef(false);
  const backupPreviewsRef = useRef(new WeakMap<LibraryBackupPreview, number>());
  const restorePreviewsRef = useRef(new WeakMap<LibraryRestorePreview, number>());

  useLayoutEffect(() => {
    depsRef.current = deps;
    libraryRef.current = library;
  }, [deps, library]);

  const commitLibrary = useCallback((next: LibraryState) => {
    revisionRef.current += 1;
    libraryRef.current = next;
    setLibrary(next);
  }, []);

  // インデックスだけを差し替える。セッションとゴミ箱はそのまま
  const commitIndex = useCallback((index: MapIndexV1) => {
    const current = libraryRef.current;
    if (current === null || current.mode !== "persistent") return;
    commitLibrary({ ...current, index });
  }, [commitLibrary]);

  // ゴミ箱状態が変化したときだけ差し替える
  const commitTrashIfChanged = useCallback((trash: MapTrashState) => {
    const current = libraryRef.current;
    if (current === null || current.mode !== "persistent") return;
    if (isSameTrashState(current.trash, trash)) return;
    commitLibrary({ ...current, trash });
  }, [commitLibrary]);

  // writeBody・registerFlush は作られたときの mapId とセッション番号を閉じ込め、
  // 呼ばれた時点の ref と照合する（照合の規則は mapLibrarySession）
  const createPersistentSession = useCallback(
    (storage: MapLibraryStorage, mapId: string, session: number): MapStorageSession =>
      createPersistentMapSession({
        storage,
        mapId,
        sessionNumber: session,
        getActiveSessionNumber: () => sessionNumberRef.current,
        getActiveIndex: () => {
          const current = libraryRef.current;
          return current?.mode === "persistent" ? current.index : null;
        },
        now: () => depsRef.current.now(),
        commitIndex,
        flushSlot: flushRef,
        backupSnapshotSlot: backupSnapshotRef,
      }),
    [commitIndex],
  );

  // 現在のマップが変わったときは、進めたセッション番号で新しいセッションを作る
  const commitSession = useCallback((
    current: PersistentLibraryState,
    index: MapIndexV1,
    sessionNumber: number,
  ) => {
    commitLibrary({
      ...current,
      index,
      session: createPersistentSession(current.storage, index.currentMapId, sessionNumber),
    });
  }, [commitLibrary, createPersistentSession]);

  // セッション番号だけを先に進める。旧セッションの writeBody と registerFlush は以後拒否される
  const advanceSessionNumber = useCallback((): number => {
    sessionNumberRef.current += 1;
    return sessionNumberRef.current;
  }, []);

  const commitNewSession = useCallback((current: PersistentLibraryState, index: MapIndexV1) => {
    commitSession(current, index, advanceSessionNumber());
  }, [advanceSessionNumber, commitSession]);

  // 起動の判定は書き込みを伴うので1回だけ確定させる。StrictMode の2回目の effect は
  // ref の結果を state に設定するだけ。購読やタイマーを持たないので cleanup は無い（L-469）。
  // 状態が確定した後の再実行（開発時の Fast Refresh）では、起動時の結果で設定し直すと
  // 起動後の操作（作成・切り替え・セッション番号の進み）が巻き戻るので何もしない。
  // StrictMode の擬似的な再マウントでは、layout effect が libraryRef をレンダー時の null に
  // 戻してから2回目が実行されるので、2回目も同じ起動の結果を設定する
  useEffect(() => {
    if (libraryRef.current !== null) return;
    const currentDeps = depsRef.current;
    if (startupRef.current === null) {
      storageRef.current = currentDeps.getStorage();
      startupRef.current = runMapLibraryStartup(storageRef.current, currentDeps);
    }
    const startup = startupRef.current;
    const storage = storageRef.current;
    if (startup.mode === "persistent" && storage !== null) {
      commitLibrary({
        mode: "persistent",
        storage,
        index: startup.index,
        session: createPersistentSession(
          storage,
          startup.index.currentMapId,
          sessionNumberRef.current,
        ),
        startupNotice: startup.notice,
        trash: readMapTrashState(storage),
      });
      return;
    }
    if (startup.mode === "persistent") {
      // runMapLibraryStartup は storage が null なら persistent を返さない
      throw new Error("保存先の無い persistent の起動結果は扱えません。");
    }
    commitLibrary({
      mode: "protected",
      entry: createMapIndexEntry(
        startup.mapId,
        startup.mapName,
        currentDeps.now().toISOString(),
      ),
      session: createProtectedStorageSession(startup.mapId, startup.initialJson),
      startupNotice: startup.notice,
    });
  }, [commitLibrary, createPersistentSession]);

  // 現在のセッション番号で登録された flush だけを呼ぶ。登録が無ければ unchanged
  const flushCurrentSession = useCallback(
    (): MapFlushResult => flushRegisteredSession(flushRef.current, sessionNumberRef.current),
    [],
  );

  const view = useMemo((): MapLibraryView => toMapLibraryView(library), [library]);

  const requirePersistent = useCallback(
    (
      fallbackNotice: OperationNotice,
      run: (current: PersistentLibraryState) => MapLibraryOperationResult,
    ): MapLibraryOperationResult => {
      if (restoreLockRef.current) return operationError(RESTORE_RETRY);
      const current = libraryRef.current;
      if (current?.mode !== "persistent") {
        return failedOperation(fallbackNotice);
      }
      return run(current);
    },
    [],
  );

  const createMap = useCallback(
    (nameInput: string): MapLibraryOperationResult =>
      requirePersistent(indexWriteFailedNotice("マップを作成"), () => {
        const validation = validateMapNameInput(nameInput);
        if (!validation.ok) {
          return failedOperation({ kind: "error", message: validation.message });
        }
        const createFlush = flushCurrentSession();
        if (createFlush.status === "failed") {
          return failedOperation(createFlushFailedNotice());
        }
        // flush で更新日時が変わるので、flush の後のインデックスを基準にする
        const current = libraryRef.current;
        if (current?.mode !== "persistent") {
          return failedOperation(indexWriteFailedNotice("マップを作成"));
        }
        const { storage, index } = current;
        const { generateId, now } = depsRef.current;
        const id = pickNewMapId(storage, index, generateId);
        if (id === null) {
          return failedOperation(mapIdUnavailableNotice());
        }
        const next = addMapEntry(
          index,
          createMapIndexEntry(id, validation.name, now().toISOString()),
        );
        if (!writeMapIndex(storage, next).ok) {
          return failedOperation(indexWriteFailedNotice("マップを作成"));
        }
        commitNewSession(current, next);
        return succeededOperation(mapCreatedNotice(validation.name), true);
      }),
    [commitNewSession, flushCurrentSession, requirePersistent],
  );

  const switchMap = useCallback(
    (id: string): MapLibraryOperationResult =>
      requirePersistent(indexWriteFailedNotice("マップを切り替え"), (before) => {
        if (findMapEntry(before.index, id) === null) {
          return failedOperation(indexWriteFailedNotice("マップを切り替え"));
        }
        if (before.index.currentMapId === id) {
          return UNCHANGED_OPERATION_RESULT;
        }
        const switchFlush = flushCurrentSession();
        if (switchFlush.status === "conflict") {
          return failedOperation(conflictSwitchMapRejectedNotice());
        }
        if (switchFlush.status === "failed") {
          return failedOperation(switchFlushFailedNotice());
        }
        // flush で更新日時が変わるので、flush の後のインデックスを基準にする
        const current = libraryRef.current;
        const next = current?.mode === "persistent" ? setCurrentMap(current.index, id) : null;
        const target = next === null ? null : findMapEntry(next, id);
        if (
          current?.mode !== "persistent"
          || next === null
          || target === null
          || !writeMapIndex(current.storage, next).ok
        ) {
          return failedOperation(indexWriteFailedNotice("マップを切り替え"));
        }
        commitNewSession(current, next);
        return succeededOperation(mapSwitchedNotice(target.name), true);
      }),
    [commitNewSession, flushCurrentSession, requirePersistent],
  );

  const renameMap = useCallback(
    (id: string, nameInput: string): MapLibraryOperationResult =>
      requirePersistent(indexWriteFailedNotice("名前を変更"), (current) => {
        const validation = validateMapNameInput(nameInput);
        if (!validation.ok) {
          return failedOperation({ kind: "error", message: validation.message });
        }
        const target = findMapEntry(current.index, id);
        if (target === null) {
          return failedOperation(indexWriteFailedNotice("名前を変更"));
        }
        if (target.name === validation.name) {
          return UNCHANGED_OPERATION_RESULT;
        }
        const next = renameMapEntry(current.index, id, validation.name);
        if (next === null || !writeMapIndex(current.storage, next).ok) {
          return failedOperation(indexWriteFailedNotice("名前を変更"));
        }
        commitIndex(next);
        return succeededOperation(mapRenamedNotice(validation.name), false);
      }),
    [commitIndex, requirePersistent],
  );

  // アクティブ一覧更新後の後始末（旧本体削除・状態更新・非現在マップ削除後の flush 再試行）の共通ヘルパー。
  // 開いているマップの削除時は先にセッション番号を進め、旧エディタからの書き戻しを防ぐ。
  const completeActiveMapDeletion = useCallback(
    (
      current: PersistentLibraryState,
      plan: PlannedMapDeletion,
      nextTrash: MapTrashState,
      notices: DeleteNotices,
    ): MapLibraryOperationResult => {
      if (plan.isCurrent) {
        const sessionNumber = advanceSessionNumber();
        const removed = removeMapBody(current.storage, plan.target.id);
        commitLibrary({
          ...current,
          index: plan.nextIndex,
          session: createPersistentSession(
            current.storage,
            plan.nextIndex.currentMapId,
            sessionNumber,
          ),
          trash: nextTrash,
        });
        return succeededOperation(removed.ok ? notices.removed : notices.bodyRemains, true);
      }
      commitLibrary({ ...current, index: plan.nextIndex, trash: nextTrash });
      const removed = removeMapBody(current.storage, plan.target.id);
      const notice = removed.ok ? notices.removed : notices.bodyRemains;
      const saveRetryNotice =
        flushCurrentSession().status === "failed" ? autoSaveFailedNotice() : null;
      return { ok: true, remounted: false, notice, saveRetryNotice };
    },
    [advanceSessionNumber, commitLibrary, createPersistentSession, flushCurrentSession],
  );

  const deleteMap = useCallback(
    (id: string): MapLibraryOperationResult =>
      requirePersistent(indexWriteFailedNotice("マップを削除"), (current) => {
        const snapshot =
          id === current.index.currentMapId ? current.session.readBackupSnapshot() : null;
        const tx = moveMapToTrash({
          storage: current.storage,
          index: current.index,
          id,
          currentMapBackupSnapshot: snapshot,
          now: depsRef.current.now(),
          generateId: depsRef.current.generateId,
        });
        if (!tx.ok) {
          if (tx.nextTrash !== undefined) commitTrashIfChanged(tx.nextTrash);
          return toFailedOperationResult(tx);
        }
        return completeActiveMapDeletion(current, tx.plan, tx.nextTrash, tx.notices);
      }),
    [commitTrashIfChanged, completeActiveMapDeletion, requirePersistent],
  );

  const permanentlyDeleteMap = useCallback(
    (id: string): MapLibraryOperationResult =>
      requirePersistent(indexWriteFailedNotice("マップを削除"), (current) => {
        const tx = permanentlyDeleteActiveMapIndex({
          storage: current.storage,
          index: current.index,
          id,
          now: depsRef.current.now(),
          generateId: depsRef.current.generateId,
        });
        if (!tx.ok) {
          return toFailedOperationResult(tx);
        }
        return completeActiveMapDeletion(current, tx.plan, current.trash, tx.notices);
      }),
    [completeActiveMapDeletion, requirePersistent],
  );

  const refreshTrash = useCallback(() => {
    const current = libraryRef.current;
    if (current?.mode !== "persistent") return;
    commitTrashIfChanged(refreshTrashState(current.storage, depsRef.current.now()));
  }, [commitTrashIfChanged]);

  const restoreFromTrash = useCallback(
    (trashId: string): MapLibraryOperationResult =>
      requirePersistent(trashRestoreWriteFailedNotice(), (current) => {
        const tx = restoreMapFromTrash({
          storage: current.storage,
          index: current.index,
          trashId,
          now: depsRef.current.now(),
          generateId: depsRef.current.generateId,
        });
        if (!tx.ok) {
          if (tx.nextTrash !== undefined) commitTrashIfChanged(tx.nextTrash);
          return toFailedOperationResult(tx);
        }
        commitLibrary({ ...current, index: tx.nextIndex, trash: tx.nextTrash });
        return succeededOperation(tx.notice, false);
      }),
    [commitLibrary, commitTrashIfChanged, requirePersistent],
  );

  const permanentlyDeleteFromTrash = useCallback(
    (trashId: string): MapLibraryOperationResult =>
      requirePersistent(trashPermanentDeleteFailedNotice(), (current) => {
        const tx = permanentlyDeleteTrashEntry({
          storage: current.storage,
          trashId,
          now: depsRef.current.now(),
        });
        if (!tx.ok) {
          if (tx.nextTrash !== undefined) commitTrashIfChanged(tx.nextTrash);
          return toFailedOperationResult(tx);
        }
        commitTrashIfChanged(tx.nextTrash);
        return succeededOperation(tx.notice, false);
      }),
    [commitTrashIfChanged, requirePersistent],
  );

  const emptyTrash = useCallback(
    (): MapLibraryOperationResult =>
      requirePersistent(trashEmptyFailedNotice(), (current) => {
        const tx = emptyTrashStorage(current.storage, current.trash.status);
        if (tx.nextTrash !== undefined) commitTrashIfChanged(tx.nextTrash);
        if (!tx.ok) {
          return toFailedOperationResult(tx);
        }
        return succeededOperation(tx.notice, false);
      }),
    [commitTrashIfChanged, requirePersistent],
  );

  const protectAfterBranchMove = useCallback((
    current: PersistentLibraryState,
    sourceJson: string | null,
    notice: OperationNotice,
  ) => {
    const entry = findMapEntry(current.index, current.index.currentMapId)!;
    advanceSessionNumber();
    commitLibrary({
      mode: "protected",
      entry,
      session: createProtectedStorageSession(entry.id, sourceJson),
      startupNotice: notice,
    });
  }, [advanceSessionNumber, commitLibrary]);

  const moveBranchToMap = useCallback((
    sourceSession: MapStorageSession,
    targetId: string,
    rootId: number,
  ): MapLibraryOperationResult =>
    requirePersistent(branchMoveRejectedNotice(), (before) => {
      if (!isActiveBranchMoveSource(before, sourceSession)
        || before.index.currentMapId === targetId || findMapEntry(before.index, targetId) === null) {
        return failedOperation(branchMoveRejectedNotice());
      }
      const moveFlush = flushCurrentSession();
      if (moveFlush.status === "conflict") {
        return failedOperation(conflictBranchMoveRejectedNotice());
      }
      if (moveFlush.status === "failed") {
        return failedOperation(branchMoveFlushFailedNotice());
      }
      // flush による更新・再入を反映し、保存領域の最新インデックスも読み直す。
      const current = libraryRef.current;
      if (!isActiveBranchMoveSource(current, sourceSession)) return failedOperation(branchMoveRejectedNotice());
      const stored = readBranchMoveIndex(current.storage);
      if (stored === null || stored.index.currentMapId !== sourceSession.mapId) {
        return failedOperation(branchMoveRejectedNotice());
      }
      const moved = transferStoredBranch(current.storage, stored.index, sourceSession.mapId, targetId, rootId, depsRef.current.now());
      if (!moved.ok) {
        const notice: OperationNotice = { kind: "error", message: moved.error };
        if (!moved.recoveryRequired) return failedOperation(notice);
        protectAfterBranchMove(current, moved.sourceJson, notice);
        return protectedModeFailure(notice);
      }
      commitNewSession(current, moved.index);
      return succeededOperation(branchMovedToMapNotice(), true);
    }), [commitNewSession, flushCurrentSession, protectAfterBranchMove, requirePersistent]);

  const prepareBackup = useCallback((): MapDocumentResult<LibraryBackupPreview> => {
    const current = libraryRef.current;
    if (restoreLockRef.current || current?.mode !== "persistent") {
      return { ok: false, error: BACKUP_RETRY };
    }
    const prepared = prepareLibraryBackup(current.storage, current.index, current.session, depsRef.current.now());
    if (prepared.ok) backupPreviewsRef.current.set(prepared.value, revisionRef.current);
    return prepared;
  }, []);

  const downloadBackup = useCallback((preview: LibraryBackupPreview): MapLibraryOperationResult => {
    const current = libraryRef.current;
    if (restoreLockRef.current || current?.mode !== "persistent" ||
      backupPreviewsRef.current.get(preview) !== revisionRef.current ||
      !isLibraryBackupPreviewCurrent(current.storage, current.index, current.session, preview)) {
      return operationError(BACKUP_RETRY);
    }
    try {
      downloadLibraryBackup(preview.json, preview.fileNameDate);
      return succeededOperation({ kind: "status", message: "バックアップのダウンロードを開始しました。" }, false);
    } catch {
      return operationError("バックアップのダウンロードを開始できませんでした。再試行してください。");
    }
  }, []);

  const previewRestore = useCallback(async (file: File): Promise<MapDocumentResult<LibraryRestorePreview>> => {
    const current = libraryRef.current;
    if (restoreLockRef.current || current?.mode !== "persistent") {
      return { ok: false, error: RESTORE_RETRY };
    }
    const indexRaw = readMatchingIndexRaw(current.storage, current.index);
    if (indexRaw === null) return { ok: false, error: RESTORE_RETRY };
    const revision = revisionRef.current;
    const read = await readLibraryBackupFile(file);
    // File.text() 中に切替や A→B→A が起きても、開始時の結果を採用しない。
    const latest = libraryRef.current;
    if (restoreLockRef.current || latest?.mode !== "persistent" ||
      latest.session !== current.session || revisionRef.current !== revision ||
      readMatchingIndexRaw(latest.storage, latest.index) !== indexRaw) {
      return { ok: false, error: RESTORE_RETRY };
    }
    if (!read.ok) return read;
    const preview = { backup: read.value, indexRaw, session: current.session };
    restorePreviewsRef.current.set(preview, revision);
    return { ok: true, value: preview };
  }, []);

  const confirmRestore = useCallback((preview: LibraryRestorePreview): MapLibraryOperationResult => {
    if (restoreLockRef.current) return operationError(RESTORE_RETRY);
    restoreLockRef.current = true;
    try {
      const before = libraryRef.current;
      if (before?.mode !== "persistent" || before.session !== preview.session ||
        restorePreviewsRef.current.get(preview) !== revisionRef.current) {
        return operationError(RESTORE_RETRY);
      }
      const restoreFlush = flushCurrentSession();
      if (restoreFlush.status === "conflict") return failedOperation(conflictRestoreRejectedNotice());
      if (restoreFlush.status === "failed") return operationError(RESTORE_FLUSH_FAILED);
      const current = libraryRef.current;
      if (current?.mode !== "persistent" || current.session !== preview.session ||
        restorePreviewsRef.current.get(preview) !== revisionRef.current ||
        readMatchingIndexRaw(current.storage, current.index) !== preview.indexRaw) return operationError(RESTORE_RETRY);

      // unchanged は保存や初回復元の証拠ではない。実際の editor 登録を確認する。
      const snapshot = current.session.readBackupSnapshot();
      if (!isEligibleMapBackupSnapshot(snapshot) ||
        !parseMapDocumentJson(snapshot.json).ok) {
        return operationError("現在のマップの復元が完了していません。マップを開き直してから再試行してください。");
      }
      const planned = planLibraryRestore(
        current.storage, current.index, preview.indexRaw, preview.backup, depsRef.current.generateId,
      );
      if (!planned.ok) return operationError(planned.error);
      if (libraryRef.current !== current || revisionRef.current !== restorePreviewsRef.current.get(preview) ||
        readMatchingIndexRaw(current.storage, current.index) !== preview.indexRaw) return operationError(RESTORE_RETRY);
      // 書込の直前に取得する。失敗時の保護 session に raw JSON を渡す。
      const latest = current.session.readBackupSnapshot();
      if (!isEligibleMapBackupSnapshot(latest) ||
        !parseMapDocumentJson(latest.json).ok) {
        return operationError("現在のマップの復元が完了していません。マップを開き直してから再試行してください。");
      }
      const written = writeLibraryRestore(current.storage, planned.value);
      if (written.status === "saved") {
        commitIndex(planned.value.indexAfter);
        return succeededOperation({ kind: "status", message: "バックアップのマップを追加しました。" }, false);
      }
      const notice: OperationNotice = { kind: "error", message: written.error };
      if (written.status === "failed") return failedOperation(notice);
      const entry = findMapEntry(current.index, current.index.currentMapId)!;
      advanceSessionNumber();
      commitLibrary({
        mode: "protected", entry,
        session: createProtectedStorageSession(entry.id, latest.json),
        startupNotice: notice,
      });
      return protectedModeFailure(notice);
    } catch {
      return operationError("バックアップから復元できませんでした。確認して再試行してください。");
    } finally {
      restoreLockRef.current = false;
    }
  }, [advanceSessionNumber, commitIndex, commitLibrary, flushCurrentSession]);

  const saveCurrentAsNewMap = useCallback(
    (nameInput: string, snapshotJson: string): MapLibraryOperationResult =>
      requirePersistent(indexWriteFailedNotice("マップを作成"), (current) => {
        const validation = validateMapNameInput(nameInput);
        if (!validation.ok) {
          return failedOperation({ kind: "error", message: validation.message });
        }

        // 旧マップへの flush は完全にバイパス（知見 L-061）
        const { storage, index } = current;
        const { generateId, now } = depsRef.current;
        const id = pickNewMapId(storage, index, generateId);
        if (id === null) {
          return failedOperation(mapIdUnavailableNotice());
        }

        const writtenBody = writeMapBody(storage, id, snapshotJson);
        if (!writtenBody.ok) {
          return failedOperation(indexWriteFailedNotice("マップを作成"));
        }

        const entry = createMapIndexEntry(id, validation.name, now().toISOString());
        const withEntry = addMapEntry(index, entry);
        const next = setCurrentMap(withEntry, id);
        if (next === null || !writeMapIndex(storage, next).ok) {
          removeMapBody(storage, id);
          return failedOperation(indexWriteFailedNotice("マップを作成"));
        }

        commitNewSession(current, next);
        return succeededOperation(mapCreatedNotice(validation.name), true);
      }),
    [commitNewSession, requirePersistent],
  );

  return {
    view,
    createMap,
    switchMap,
    renameMap,
    deleteMap,
    permanentlyDeleteMap,
    refreshTrash,
    restoreFromTrash,
    permanentlyDeleteFromTrash,
    emptyTrash,
    moveBranchToMap,
    prepareBackup,
    downloadBackup,
    previewRestore,
    confirmRestore,
    saveCurrentAsNewMap,
  };
}
