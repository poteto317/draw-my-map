"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
import type { MapTrashEntry } from "@/domain/mapLibrary/mapTrash";
import {
  backFrom,
  backToList,
  closeAfterEnteringProtectedMode,
  closeAfterSuccess,
  closeDialog,
  INITIAL_STATE,
  nextScreenAfterActiveDeletion,
  nextScreenOnBack,
  nextShellNotice,
  openScreen,
  returnAfterActiveDeletion,
  returnToList,
  returnToTrashAfterAction,
  selectFocusAfterRemoval,
  selectFocusAfterTrashRemoval,
  showFailure,
  type DialogState,
  type HeaderFocusRequest,
} from "@/hooks/mapLibraryDialogState";
import type {
  MapLibraryOperationResult,
  UseMapLibraryResult,
} from "@/hooks/useMapLibrary";
import type {
  MapLibraryDialogFocusTarget,
  MapLibraryDialogNotices,
  MapLibraryDialogScreen,
  OpenMapLibraryDialogScreen,
} from "@/types/mapLibraryDialog";
import type { MapStorageSession } from "@/types/mapStorageSession";
import type { OperationNotice, ShellNotice } from "@/types/operationNotice";

export type { HeaderFocusRequest };
export { selectFocusAfterRemoval };

export type UseMapLibraryDialogStateResult = {
  screen: MapLibraryDialogScreen;
  notices: MapLibraryDialogNotices;
  focusTarget: MapLibraryDialogFocusTarget | null;
  headerFocusRequest: HeaderFocusRequest | null;
  shellNotice: ShellNotice | null;
  openList: () => void;
  openCreateFromHeader: () => void;
  openCreateFromList: () => void;
  openRename: (mapId: string) => void;
  openDelete: (mapId: string) => void;
  openTrash: () => void;
  back: () => void; // Escape と「キャンセル」の共通処理
  close: () => void; // 一覧の「閉じる」
  submitCreate: (nameInput: string) => void;
  switchTo: (mapId: string) => void;
  submitRename: (mapId: string, nameInput: string) => void;
  confirmDelete: (mapId: string) => void;
  confirmPermanentDeleteActive: (mapId: string) => void;
  restoreTrash: (trashId: string) => void;
  openTrashPermanentDelete: (trashId: string) => void;
  confirmTrashPermanentDelete: (trashId: string) => void;
  openEmptyTrash: () => void;
  confirmEmptyTrash: () => void;
  prepareBackup: () => void;
  downloadBackup: () => void;
  selectRestoreFile: (file: File) => Promise<void>;
  confirmRestore: () => void;
  moveBranchToMap: UseMapLibraryResult["moveBranchToMap"];
  consumeFocusTarget: () => void;
  consumeHeaderFocusRequest: () => void;
};

type MapLibraryOperations = Pick<
  UseMapLibraryResult,
  | "createMap"
  | "switchMap"
  | "renameMap"
  | "deleteMap"
  | "permanentlyDeleteMap"
  | "refreshTrash"
  | "restoreFromTrash"
  | "permanentlyDeleteFromTrash"
  | "emptyTrash"
  | "moveBranchToMap"
  | "prepareBackup"
  | "downloadBackup"
  | "previewRestore"
  | "confirmRestore"
>;

export function useMapLibraryDialogState(options: {
  library: MapLibraryOperations;
  maps: readonly MapIndexEntry[]; // 表示順
  trashEntries: readonly MapTrashEntry[]; // 表示順
  startupNotice: OperationNotice | null;
}): UseMapLibraryDialogStateResult {
  const { library, maps, trashEntries, startupNotice } = options;
  const [state, setState] = useState<DialogState>(INITIAL_STATE);
  // 操作の関数を描画ごとに変えないため、最新の library・maps・trashEntries は ref から読む（L-521）
  const libraryRef = useRef(library);
  const mapsRef = useRef(maps);
  const trashEntriesRef = useRef(trashEntries);
  const screenRef = useRef<MapLibraryDialogScreen>(INITIAL_STATE.screen);
  const generationRef = useRef(0);
  const readingRef = useRef(false);

  const transition = useCallback((screen: MapLibraryDialogScreen) => {
    generationRef.current += 1;
    screenRef.current = screen;
    readingRef.current = false;
  }, []);

  const openDialogScreen = useCallback(
    (screen: OpenMapLibraryDialogScreen) => {
      transition(screen);
      setState((prev) => openScreen(prev, screen));
    },
    [transition],
  );

  useLayoutEffect(() => {
    libraryRef.current = library;
    mapsRef.current = maps;
    trashEntriesRef.current = trashEntries;
  }, [library, maps, trashEntries]);

  // 起動の通知は、Home が loading を描画した後に値へ変わる。effect で遅らせず、
  // レンダー中の条件付きの state 調整で1回だけシェルの通知にする（L-521）
  if (startupNotice !== null && !state.startupNoticeShown) {
    setState((prev) =>
      prev.startupNoticeShown
        ? prev
        : {
          ...prev,
          startupNoticeShown: true,
          shellNotice: nextShellNotice(prev, startupNotice),
        },
    );
  }

  // 同じイベントの中で続けて変えても前の更新を消さないよう、関数形式で更新する（L-453）
  const openList = useCallback(() => {
    libraryRef.current.refreshTrash();
    openDialogScreen({ kind: "list" });
  }, [openDialogScreen]);

  const openCreateFromHeader = useCallback(
    () => openDialogScreen({ kind: "create", origin: "header" }),
    [openDialogScreen],
  );

  const openCreateFromList = useCallback(
    () => openDialogScreen({ kind: "create", origin: "list" }),
    [openDialogScreen],
  );

  const openRename = useCallback(
    (mapId: string) => openDialogScreen({ kind: "rename", mapId }),
    [openDialogScreen],
  );

  const openDelete = useCallback(
    (mapId: string) => openDialogScreen({ kind: "delete", mapId }),
    [openDialogScreen],
  );

  const openTrash = useCallback(() => {
    libraryRef.current.refreshTrash();
    openDialogScreen({ kind: "trash" });
  }, [openDialogScreen]);

  const openTrashPermanentDelete = useCallback(
    (trashId: string) => openDialogScreen({ kind: "trashPermanentDelete", trashId }),
    [openDialogScreen],
  );

  const openEmptyTrash = useCallback(
    () => openDialogScreen({ kind: "trashEmptyConfirm" }),
    [openDialogScreen],
  );

  const back = useCallback(() => {
    transition(nextScreenOnBack(screenRef.current));
    setState(backFrom);
  }, [transition]);

  const close = useCallback(() => {
    transition({ kind: "closed" });
    setState((prev) => closeDialog(prev, "list"));
  }, [transition]);

  const prepareBackup = useCallback(() => {
    if (screenRef.current.kind !== "list" || readingRef.current) return;
    const prepared = libraryRef.current.prepareBackup();
    if (!prepared.ok) {
      setState((prev) => showFailure(prev, { kind: "error", message: prepared.error }));
      return;
    }
    openDialogScreen({ kind: "backupConfirm", preview: prepared.value });
  }, [openDialogScreen]);

  const downloadBackup = useCallback(() => {
    const screen = screenRef.current;
    if (screen.kind !== "backupConfirm") return;
    transition({ kind: "list" });
    const result = libraryRef.current.downloadBackup(screen.preview);
    setState((prev) =>
      result.ok
        ? returnToList(prev, result, { kind: "backupButton" })
        : backToList(prev, { kind: "backupButton" }, result.notice.message),
    );
  }, [transition]);

  const selectRestoreFile = useCallback(async (file: File) => {
    if (screenRef.current.kind !== "list" || readingRef.current) return;
    openDialogScreen({ kind: "restoreReading" });
    readingRef.current = true;
    const generation = generationRef.current;
    let prepared: Awaited<ReturnType<MapLibraryOperations["previewRestore"]>>;
    try {
      prepared = await libraryRef.current.previewRestore(file);
    } catch {
      prepared = { ok: false, error: "バックアップを読み込めませんでした。再試行してください。" };
    }
    if (generationRef.current !== generation || (screenRef.current as MapLibraryDialogScreen).kind !== "restoreReading") return;
    readingRef.current = false;
    if (!prepared.ok) {
      transition({ kind: "list" });
      setState((prev) => backToList(prev, { kind: "restoreButton" }, prepared.error));
      return;
    }
    openDialogScreen({ kind: "restoreConfirm", preview: prepared.value });
  }, [openDialogScreen, transition]);

  const confirmRestore = useCallback(() => {
    const screen = screenRef.current;
    if (screen.kind !== "restoreConfirm") return;
    const result = libraryRef.current.confirmRestore(screen.preview);
    transition(
      !result.ok && result.enteredProtectedMode ? { kind: "closed" } : { kind: "list" },
    );
    setState((prev) => {
      if (!result.ok && result.enteredProtectedMode) {
        return closeAfterEnteringProtectedMode(prev, result.notice);
      }
      if (!result.ok) {
        return backToList(prev, { kind: "restoreButton" }, result.notice.message);
      }
      return returnToList(prev, result, { kind: "restoreButton" });
    });
  }, [transition]);

  const submitCreate = useCallback((nameInput: string) => {
    const result = libraryRef.current.createMap(nameInput);
    if (result.ok) transition({ kind: "closed" });
    setState((prev) => (result.ok ? closeAfterSuccess(prev, result) : showFailure(prev, result.notice)));
  }, [transition]);

  // 開いているマップは本物が「変化なし」（remounted: false）を返すので、何もせず閉じる
  const switchTo = useCallback((mapId: string) => {
    const result = libraryRef.current.switchMap(mapId);
    if (result.ok) transition({ kind: "closed" });
    setState((prev) => (result.ok ? closeAfterSuccess(prev, result) : showFailure(prev, result.notice)));
  }, [transition]);

  const submitRename = useCallback((mapId: string, nameInput: string) => {
    const result = libraryRef.current.renameMap(mapId, nameInput);
    if (result.ok) transition({ kind: "list" });
    setState((prev) =>
      result.ok
        ? returnToList(prev, result, { kind: "row", mapId, action: "rename" })
        : showFailure(prev, result.notice),
    );
  }, [transition]);

  const runActiveDeletion = useCallback(
    (mapId: string, deleteOperation: (id: string) => MapLibraryOperationResult) => {
      // 戻し先は削除前の表示順で決める
      const focusAfterRemoval = selectFocusAfterRemoval(mapsRef.current, mapId);
      const result = deleteOperation(mapId);
      const nextScreen = nextScreenAfterActiveDeletion(result, mapId);
      if (nextScreen !== null) transition(nextScreen);
      setState((prev) => returnAfterActiveDeletion(prev, result, mapId, focusAfterRemoval));
    },
    [transition],
  );

  const confirmDelete = useCallback(
    (mapId: string) => runActiveDeletion(mapId, (id) => libraryRef.current.deleteMap(id)),
    [runActiveDeletion],
  );

  const confirmPermanentDeleteActive = useCallback(
    (mapId: string) => runActiveDeletion(mapId, (id) => libraryRef.current.permanentlyDeleteMap(id)),
    [runActiveDeletion],
  );

  const finishTrashTransition = useCallback(
    (result: MapLibraryOperationResult, nextFocusTarget: MapLibraryDialogFocusTarget) => {
      if (!result.ok && result.enteredProtectedMode) {
        transition({ kind: "closed" });
        setState((prev) => closeAfterEnteringProtectedMode(prev, result.notice));
        return;
      }
      transition({ kind: "trash" });
      setState((prev) => returnToTrashAfterAction(prev, result, nextFocusTarget));
    },
    [transition],
  );

  // 成功で行が消えたら隣の行へ、失敗で行が残るなら押した行の同じボタンへ戻す。
  // 失敗でも行が消えていれば（対象不在など）、描画されない行の代わりに「一覧に戻る」へ落ちる
  const restoreTrash = useCallback(
    (trashId: string) => {
      const focusAfterRemoval = selectFocusAfterTrashRemoval(trashEntriesRef.current, trashId);
      const result = libraryRef.current.restoreFromTrash(trashId);
      finishTrashTransition(
        result,
        result.ok ? focusAfterRemoval : { kind: "trashRow", trashId, action: "restore" },
      );
    },
    [finishTrashTransition],
  );

  const confirmTrashPermanentDelete = useCallback(
    (trashId: string) => {
      const focusAfterRemoval = selectFocusAfterTrashRemoval(trashEntriesRef.current, trashId);
      const result = libraryRef.current.permanentlyDeleteFromTrash(trashId);
      finishTrashTransition(
        result,
        result.ok ? focusAfterRemoval : { kind: "trashRow", trashId, action: "permanentDelete" },
      );
    },
    [finishTrashTransition],
  );

  const confirmEmptyTrash = useCallback(() => {
    const result = libraryRef.current.emptyTrash();
    const nextFocus: MapLibraryDialogFocusTarget = result.ok
      ? { kind: "backToListButton" }
      : { kind: "emptyTrashButton" };
    finishTrashTransition(result, nextFocus);
  }, [finishTrashTransition]);

  // ダイアログは MapEditor が持つ。再マウントしない失敗は結果を返すだけで、そちらのエラー表示に任せる
  const moveBranchToMap = useCallback((
    sourceSession: MapStorageSession,
    targetId: string,
    rootId: number,
  ): MapLibraryOperationResult => {
    const result = libraryRef.current.moveBranchToMap(sourceSession, targetId, rootId);
    if (result.ok || result.enteredProtectedMode) transition({ kind: "closed" });
    setState((prev) => {
      if (result.ok) return closeAfterSuccess(prev, result);
      return result.enteredProtectedMode ? closeAfterEnteringProtectedMode(prev, result.notice) : prev;
    });
    return result;
  }, [transition]);

  const consumeFocusTarget = useCallback(() => {
    setState((prev) => (prev.focusTarget === null ? prev : { ...prev, focusTarget: null }));
  }, []);

  const consumeHeaderFocusRequest = useCallback(() => {
    setState((prev) =>
      prev.headerFocusRequest === null ? prev : { ...prev, headerFocusRequest: null },
    );
  }, []);

  return {
    screen: state.screen,
    notices: state.notices,
    focusTarget: state.focusTarget,
    headerFocusRequest: state.headerFocusRequest,
    shellNotice: state.shellNotice,
    openList,
    openCreateFromHeader,
    openCreateFromList,
    openRename,
    openDelete,
    openTrash,
    back,
    close,
    submitCreate,
    switchTo,
    submitRename,
    confirmDelete,
    confirmPermanentDeleteActive,
    restoreTrash,
    openTrashPermanentDelete,
    confirmTrashPermanentDelete,
    openEmptyTrash,
    confirmEmptyTrash,
    prepareBackup,
    downloadBackup,
    selectRestoreFile,
    confirmRestore,
    moveBranchToMap,
    consumeFocusTarget,
    consumeHeaderFocusRequest,
  };
}
