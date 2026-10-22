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
  pickUnusedMapId,
  removeMapEntry,
  renameMapEntry,
  replaceLastMapEntry,
  setCurrentMap,
  sortMapEntriesForDisplay,
  touchMapEntry,
  type MapIndexEntry,
  type MapIndexV1,
} from "@/domain/mapLibrary/mapIndex";
import {
  DEFAULT_MAP_NAME,
  validateMapNameInput,
} from "@/domain/mapLibrary/mapName";
import {
  hasMapBody,
  readMapBody,
  removeMapBody,
  writeMapBody,
  writeMapIndex,
  type MapLibraryStorage,
} from "@/services/persistence/mapLibraryStorage";
import {
  runMapLibraryStartup,
  type MapLibraryStartupResult,
} from "@/services/persistence/mapLibraryStartupRunner";
import { createProtectedStorageSession } from "@/services/persistence/protectedStorageSession";
import type { MapFlushResult, MapStorageSession } from "@/types/mapStorageSession";
import type { OperationNotice } from "@/types/operationNotice";

export type MapLibraryDeps = {
  getStorage: () => MapLibraryStorage | null;
  now: () => Date;
  generateId: () => string;
};

export type MapLibraryView =
  | { status: "loading" }
  | {
      status: "ready";
      storageMode: "persistent" | "protected";
      maps: readonly MapIndexEntry[]; // 表示順
      currentMap: MapIndexEntry;
      storageSession: MapStorageSession;
      startupNotice: OperationNotice | null;
    };

export type MapLibraryOperationResult =
  | {
      ok: true;
      remounted: boolean;
      notice: OperationNotice | null;
      saveRetryNotice: OperationNotice | null;
    }
  | { ok: false; notice: OperationNotice };

export type UseMapLibraryResult = {
  view: MapLibraryView;
  createMap: (nameInput: string) => MapLibraryOperationResult;
  switchMap: (id: string) => MapLibraryOperationResult;
  renameMap: (id: string, nameInput: string) => MapLibraryOperationResult;
  deleteMap: (id: string) => MapLibraryOperationResult;
};

// 起動の結果から作る、シェルが持つ状態。セッションは (currentMapId, セッション番号) ごとに作り直す。
// セッション番号は sessionNumberRef だけが持ち、session の writeBody・registerFlush が閉じ込める
type LibraryState =
  | {
      mode: "persistent";
      storage: MapLibraryStorage;
      index: MapIndexV1;
      session: MapStorageSession;
      startupNotice: OperationNotice | null;
    }
  | {
      mode: "protected";
      entry: MapIndexEntry;
      session: MapStorageSession;
      startupNotice: OperationNotice;
    };

type PersistentLibraryState = Extract<LibraryState, { mode: "persistent" }>;

type FlushRegistration = { session: number; flush: () => MapFlushResult };

const UNCHANGED_RESULT: MapLibraryOperationResult = {
  ok: true,
  remounted: false,
  notice: null,
  saveRetryNotice: null,
};

function succeeded(
  notice: OperationNotice,
  remounted: boolean,
): MapLibraryOperationResult {
  return { ok: true, remounted, notice, saveRetryNotice: null };
}

function failed(notice: OperationNotice): MapLibraryOperationResult {
  return { ok: false, notice };
}

// 新しいマップの id。インデックスの id と、本体が残っている id（孤立した本体）を使用済みとして避ける
function pickNewMapId(
  storage: MapLibraryStorage,
  index: MapIndexV1,
  generateId: () => string,
): string | null {
  return pickUnusedMapId(
    generateId,
    (candidate) => findMapEntry(index, candidate) !== null || hasMapBody(storage, candidate),
  );
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

  // writeBody は作られたときの mapId とセッション番号を閉じ込める
  const createPersistentSession = useCallback(
    (storage: MapLibraryStorage, mapId: string, session: number): MapStorageSession => ({
      mapId,
      readBody: () => readMapBody(storage, mapId),
      writeBody: (json) => {
        const current = libraryRef.current;
        // セッション番号で照合する。マップ id だけでは A → B → A を区別できない（L-571、L-103）
        if (
          session !== sessionNumberRef.current
          || current === null
          || current.mode !== "persistent"
          || findMapEntry(current.index, mapId) === null
        ) {
          return { status: "inactive" };
        }
        const written = writeMapBody(storage, mapId, json);
        if (!written.ok) return { status: "failed", error: written.error };
        // 更新日時の書き込みに失敗しても本体は保存済み。次の保存で書き直す
        const touched = touchMapEntry(
          current.index,
          mapId,
          depsRef.current.now().toISOString(),
        );
        if (touched !== null && writeMapIndex(storage, touched).ok) {
          commitIndex(touched);
        }
        return { status: "saved" };
      },
      registerFlush: (flush) => {
        // 古いセッションの登録で、現在のセッションの登録を上書きしない
        if (session !== sessionNumberRef.current) {
          return () => {};
        }
        const registration: FlushRegistration = { session, flush };
        flushRef.current = registration;
        return () => {
          if (flushRef.current === registration) flushRef.current = null;
        };
      },
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
  const flushCurrentSession = useCallback((): MapFlushResult => {
    const registration = flushRef.current;
    if (registration === null || registration.session !== sessionNumberRef.current) {
      return { status: "unchanged" };
    }
    return registration.flush();
  }, []);

  const view = useMemo((): MapLibraryView => {
    if (library === null) return { status: "loading" };
    if (library.mode === "protected") {
      return {
        status: "ready",
        storageMode: "protected",
        maps: [library.entry],
        currentMap: library.entry,
        storageSession: library.session,
        startupNotice: library.startupNotice,
      };
    }
    const currentMap = findMapEntry(library.index, library.index.currentMapId);
    if (currentMap === null) {
      // decodeMapIndex と更新関数が currentMapId を maps の id に保つ
      throw new Error("現在のマップがインデックスにありません。");
    }
    return {
      status: "ready",
      storageMode: "persistent",
      maps: sortMapEntriesForDisplay(library.index.maps),
      currentMap,
      storageSession: library.session,
      startupNotice: library.startupNotice,
    };
  }, [library]);

  const createMap = useCallback((nameInput: string): MapLibraryOperationResult => {
    if (libraryRef.current?.mode !== "persistent") {
      return failed(indexWriteFailedNotice("マップを作成"));
    }
    const validation = validateMapNameInput(nameInput);
    if (!validation.ok) {
      return failed({ kind: "error", message: validation.message });
    }
    if (flushCurrentSession().status === "failed") {
      return failed(createFlushFailedNotice());
    }
    // flush で更新日時が変わるので、flush の後のインデックスを基準にする
    const current = libraryRef.current;
    if (current?.mode !== "persistent") {
      return failed(indexWriteFailedNotice("マップを作成"));
    }
    const { storage, index } = current;
    const { generateId, now } = depsRef.current;
    const id = pickNewMapId(storage, index, generateId);
    if (id === null) {
      return failed(mapIdUnavailableNotice());
    }
    const next = addMapEntry(
      index,
      createMapIndexEntry(id, validation.name, now().toISOString()),
    );
    if (!writeMapIndex(storage, next).ok) {
      return failed(indexWriteFailedNotice("マップを作成"));
    }
    commitNewSession(current, next);
    return succeeded(mapCreatedNotice(validation.name), true);
  }, [commitNewSession, flushCurrentSession]);

  const switchMap = useCallback((id: string): MapLibraryOperationResult => {
    const before = libraryRef.current;
    if (before?.mode !== "persistent" || findMapEntry(before.index, id) === null) {
      return failed(indexWriteFailedNotice("マップを切り替え"));
    }
    if (before.index.currentMapId === id) {
      return UNCHANGED_RESULT;
    }
    if (flushCurrentSession().status === "failed") {
      return failed(switchFlushFailedNotice());
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
      return failed(indexWriteFailedNotice("マップを切り替え"));
    }
    commitNewSession(current, next);
    return succeeded(mapSwitchedNotice(target.name), true);
  }, [commitNewSession, flushCurrentSession]);

  const renameMap = useCallback(
    (id: string, nameInput: string): MapLibraryOperationResult => {
      const current = libraryRef.current;
      if (current?.mode !== "persistent") {
        return failed(indexWriteFailedNotice("名前を変更"));
      }
      const validation = validateMapNameInput(nameInput);
      if (!validation.ok) {
        return failed({ kind: "error", message: validation.message });
      }
      const target = findMapEntry(current.index, id);
      if (target === null) {
        return failed(indexWriteFailedNotice("名前を変更"));
      }
      if (target.name === validation.name) {
        return UNCHANGED_RESULT;
      }
      const next = renameMapEntry(current.index, id, validation.name);
      if (next === null || !writeMapIndex(current.storage, next).ok) {
        return failed(indexWriteFailedNotice("名前を変更"));
      }
      commitIndex(next);
      return succeeded(mapRenamedNotice(validation.name), false);
    },
    [commitIndex],
  );

  // 開いていない別のマップの削除。再マウントしないので事前に flush せず、
  // 削除で空いた容量へ保存待ちを書き直すため、削除の後に flush を再試行する
  const deleteOtherMap = useCallback(
    (current: PersistentLibraryState, target: MapIndexEntry): MapLibraryOperationResult => {
      const next = removeMapEntry(current.index, target.id);
      if (next === null || !writeMapIndex(current.storage, next).ok) {
        return failed(indexWriteFailedNotice("マップを削除"));
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
        return failed(indexWriteFailedNotice("マップを削除"));
      }
      const sessionNumber = advanceSessionNumber();
      const removed = removeMapBody(current.storage, target.id);
      commitSession(current, next, sessionNumber);
      return succeeded(removed.ok ? notices.removed : notices.bodyRemains, true);
    },
    [advanceSessionNumber, commitSession],
  );

  const deleteMap = useCallback((id: string): MapLibraryOperationResult => {
    const current = libraryRef.current;
    const target = current?.mode === "persistent" ? findMapEntry(current.index, id) : null;
    if (current?.mode !== "persistent" || target === null) {
      return failed(indexWriteFailedNotice("マップを削除"));
    }
    const { storage, index } = current;
    if (index.currentMapId !== id) {
      return deleteOtherMap(current, target);
    }
    if (index.maps.length > 1) {
      const next = removeMapEntry(index, id);
      const nextMap = next === null ? null : findMapEntry(next, next.currentMapId);
      if (next === null || nextMap === null) {
        return failed(indexWriteFailedNotice("マップを削除"));
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
      return failed(mapIdUnavailableNotice());
    }
    const next = replaceLastMapEntry(
      index,
      id,
      createMapIndexEntry(newId, DEFAULT_MAP_NAME, now().toISOString()),
    );
    if (next === null) {
      return failed(indexWriteFailedNotice("マップを削除"));
    }
    return deleteOpenMap(current, target, next, {
      removed: lastMapDeletedNotice(target.name),
      bodyRemains: lastBodyRemovalFailedNotice(target.name),
    });
  }, [deleteOpenMap, deleteOtherMap]);

  return { view, createMap, switchMap, renameMap, deleteMap };
}
