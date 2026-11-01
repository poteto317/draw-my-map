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
  bodyRemovalFailedNotice,
  branchMovedToMapNotice,
  branchMoveFlushFailedNotice,
  branchMoveRejectedNotice,
  createFlushFailedNotice,
  currentBodyRemovalFailedNotice,
  currentMapDeletedNotice,
  indexWriteFailedNotice,
  lastBodyRemovalFailedNotice,
  lastMapDeletedNotice,
  mapCreatedNotice,
  mapDeletedNotice,
  mapIdUnavailableNotice,
  mapRenamedNotice,
  mapSwitchedNotice,
  switchFlushFailedNotice,
} from "@/domain/mapLibrary/mapLibraryMessages";
import {
  addMapEntry,
  createMapIndexEntry,
  findMapEntry,
  removeMapEntry,
  renameMapEntry,
  replaceLastMapEntry,
  setCurrentMap,
  type MapIndexEntry,
  type MapIndexV1,
} from "@/domain/mapLibrary/mapIndex";
import {
  DEFAULT_MAP_NAME,
  validateMapNameInput,
} from "@/domain/mapLibrary/mapName";
import {
  createPersistentMapSession,
  flushRegisteredSession,
  type FlushRegistration,
} from "@/hooks/mapLibrarySession";
import {
  failedOperation,
  isActiveBranchMoveSource,
  pickNewMapId,
  protectedModeFailure,
  succeededOperation,
  toMapLibraryView,
  UNCHANGED_OPERATION_RESULT,
  type LibraryState,
  type MapLibraryOperationResult,
  type MapLibraryView,
  type PersistentLibraryState,
} from "@/hooks/mapLibraryState";
import {
  removeMapBody,
  writeMapIndex,
  type MapLibraryStorage,
} from "@/services/persistence/mapLibraryStorage";
import {
  runMapLibraryStartup,
  type MapLibraryStartupResult,
} from "@/services/persistence/mapLibraryStartupRunner";
import { readBranchMoveIndex, transferStoredBranch } from "@/services/persistence/mapBranchTransfer";
import { createProtectedStorageSession } from "@/services/persistence/protectedStorageSession";
import type { MapFlushResult, MapStorageSession } from "@/types/mapStorageSession";
import type { OperationNotice } from "@/types/operationNotice";

// 表示用の値と操作の結果の型は mapLibraryState が定義する。既存の import 先を保つため再エクスポートする
export type { MapLibraryOperationResult, MapLibraryView } from "@/hooks/mapLibraryState";

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
  moveBranchToMap: (sourceSession: MapStorageSession, targetId: string, rootId: number) => MapLibraryOperationResult;
};

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

  useLayoutEffect(() => {
    depsRef.current = deps;
    libraryRef.current = library;
  }, [deps, library]);

  const commitLibrary = useCallback((next: LibraryState) => {
    libraryRef.current = next;
    setLibrary(next);
  }, []);

  // インデックスだけを差し替える。セッションはそのまま
  const commitIndex = useCallback((index: MapIndexV1) => {
    const current = libraryRef.current;
    if (current === null || current.mode !== "persistent") return;
    commitLibrary({ ...current, index });
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

  const createMap = useCallback((nameInput: string): MapLibraryOperationResult => {
    if (libraryRef.current?.mode !== "persistent") {
      return failedOperation(indexWriteFailedNotice("マップを作成"));
    }
    const validation = validateMapNameInput(nameInput);
    if (!validation.ok) {
      return failedOperation({ kind: "error", message: validation.message });
    }
    if (flushCurrentSession().status === "failed") {
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
  }, [commitNewSession, flushCurrentSession]);

  const switchMap = useCallback((id: string): MapLibraryOperationResult => {
    const before = libraryRef.current;
    if (before?.mode !== "persistent" || findMapEntry(before.index, id) === null) {
      return failedOperation(indexWriteFailedNotice("マップを切り替え"));
    }
    if (before.index.currentMapId === id) {
      return UNCHANGED_OPERATION_RESULT;
    }
    if (flushCurrentSession().status === "failed") {
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
  }, [commitNewSession, flushCurrentSession]);

  const renameMap = useCallback(
    (id: string, nameInput: string): MapLibraryOperationResult => {
      const current = libraryRef.current;
      if (current?.mode !== "persistent") {
        return failedOperation(indexWriteFailedNotice("名前を変更"));
      }
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
    },
    [commitIndex],
  );

  // 開いていない別のマップの削除。再マウントしないので事前に flush せず、
  // 削除で空いた容量へ保存待ちを書き直すため、削除の後に flush を再試行する
  const deleteOtherMap = useCallback(
    (current: PersistentLibraryState, target: MapIndexEntry): MapLibraryOperationResult => {
      const next = removeMapEntry(current.index, target.id);
      if (next === null || !writeMapIndex(current.storage, next).ok) {
        return failedOperation(indexWriteFailedNotice("マップを削除"));
      }
      commitIndex(next);
      // インデックスを先に書き、本体を後に消す。消せなければ孤立した本体として残す
      const removed = removeMapBody(current.storage, target.id);
      const notice = removed.ok
        ? mapDeletedNotice(target.name)
        : bodyRemovalFailedNotice(target.name);
      const saveRetryNotice =
        flushCurrentSession().status === "failed" ? autoSaveFailedNotice() : null;
      return { ok: true, remounted: false, notice, saveRetryNotice };
    },
    [commitIndex, flushCurrentSession],
  );

  // 開いているマップの削除。保存待ちは削除するマップの内容なので flush せずに捨てる。
  // インデックスを書けたら、本体を消す前にセッション番号を進め、旧エディタの保存が
  // 消した本体を書き戻さないようにする
  const deleteOpenMap = useCallback(
    (
      current: PersistentLibraryState,
      target: MapIndexEntry,
      next: MapIndexV1,
      notices: { removed: OperationNotice; bodyRemains: OperationNotice },
    ): MapLibraryOperationResult => {
      if (!writeMapIndex(current.storage, next).ok) {
        return failedOperation(indexWriteFailedNotice("マップを削除"));
      }
      const sessionNumber = advanceSessionNumber();
      const removed = removeMapBody(current.storage, target.id);
      commitSession(current, next, sessionNumber);
      return succeededOperation(removed.ok ? notices.removed : notices.bodyRemains, true);
    },
    [advanceSessionNumber, commitSession],
  );

  const deleteMap = useCallback((id: string): MapLibraryOperationResult => {
    const current = libraryRef.current;
    const target = current?.mode === "persistent" ? findMapEntry(current.index, id) : null;
    if (current?.mode !== "persistent" || target === null) {
      return failedOperation(indexWriteFailedNotice("マップを削除"));
    }
    const { storage, index } = current;
    if (index.currentMapId !== id) {
      return deleteOtherMap(current, target);
    }
    if (index.maps.length > 1) {
      const next = removeMapEntry(index, id);
      const nextMap = next === null ? null : findMapEntry(next, next.currentMapId);
      if (next === null || nextMap === null) {
        return failedOperation(indexWriteFailedNotice("マップを削除"));
      }
      return deleteOpenMap(current, target, next, {
        removed: currentMapDeletedNotice(target.name, nextMap.name),
        bodyRemains: currentBodyRemovalFailedNotice(target.name, nextMap.name),
      });
    }
    // 最後の1つは、新しい「無題のマップ」に置き換えて常に1つ以上残す。本体は書かない
    const { generateId, now } = depsRef.current;
    const newId = pickNewMapId(storage, index, generateId);
    if (newId === null) {
      return failedOperation(mapIdUnavailableNotice());
    }
    const next = replaceLastMapEntry(
      index,
      id,
      createMapIndexEntry(newId, DEFAULT_MAP_NAME, now().toISOString()),
    );
    if (next === null) {
      return failedOperation(indexWriteFailedNotice("マップを削除"));
    }
    return deleteOpenMap(current, target, next, {
      removed: lastMapDeletedNotice(target.name),
      bodyRemains: lastBodyRemovalFailedNotice(target.name),
    });
  }, [deleteOpenMap, deleteOtherMap]);

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
  ): MapLibraryOperationResult => {
    const before = libraryRef.current;
    if (!isActiveBranchMoveSource(before, sourceSession)
      || before.index.currentMapId === targetId || findMapEntry(before.index, targetId) === null) {
      return failedOperation(branchMoveRejectedNotice());
    }
    if (flushCurrentSession().status === "failed") {
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
  }, [commitNewSession, flushCurrentSession, protectAfterBranchMove]);

  return { view, createMap, switchMap, renameMap, deleteMap, moveBranchToMap };
}
