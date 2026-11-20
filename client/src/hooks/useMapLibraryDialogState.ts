"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
import {
  filterAndSortMapsForList,
  type MapLibraryMetaV1,
  type MapListFolderFilter,
  type MapListTab,
} from "@/domain/mapLibrary/mapLibraryMeta";
import type { MapTrashEntry } from "@/domain/mapLibrary/mapTrash";
import {
  backFrom,
  backToList,
  closeAfterEnteringProtectedMode,
  closeAfterSuccess,
  closeDialog,
  closeDialogSilently,
  INITIAL_STATE,
  nextScreenAfterActiveDeletion,
  nextScreenOnBack,
  nextShellNotice,
  openScreen,
  publishShellNoticeState,
  returnAfterActiveDeletion,
  returnToFoldersAfterAction,
  returnToList,
  returnToTrashAfterAction,
  selectFocusAfterFavoriteToggle,
  selectFocusAfterFolderAssign,
  selectFocusAfterFolderRemoval,
  selectFocusAfterRemoval,
  selectFocusAfterTrashRemoval,
  showFailure,
  stayWithResult,
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

const ALL_FOLDERS_FILTER: MapListFolderFilter = { kind: "all" };

export type UseMapLibraryDialogStateResult = {
  screen: MapLibraryDialogScreen;
  notices: MapLibraryDialogNotices;
  focusTarget: MapLibraryDialogFocusTarget | null;
  headerFocusRequest: HeaderFocusRequest | null;
  shellNotice: ShellNotice | null;
  listTab: MapListTab;
  setListTab: (tab: MapListTab) => void;
  folderFilter: MapListFolderFilter;
  setFolderFilter: (filter: MapListFolderFilter) => void;
  openList: () => void;
  openCreateFromHeader: () => void;
  openCreateFromList: () => void;
  openRename: (mapId: string) => void;
  openDelete: (mapId: string) => void;
  openTrash: () => void;
  openFolders: () => void;
  openFolderRename: (folderId: string) => void;
  openFolderDelete: (folderId: string) => void;
  back: () => void; // Escape と「キャンセル」の共通処理
  close: () => void; // 一覧の「閉じる」
  closeSilently: () => void; // headerFocusRequest を立てずに閉じる
  publishShellNotice: (notice: OperationNotice) => void;
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
  toggleFavorite: (mapId: string) => void;
  assignFolder: (mapId: string, folderId: string | null) => void;
  submitCreateFolder: (nameInput: string) => boolean;
  submitRenameFolder: (folderId: string, nameInput: string) => void;
  confirmDeleteFolder: (folderId: string) => void;
  resetLibraryMeta: () => void;
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
  | "toggleFavorite"
  | "assignFolder"
  | "createFolder"
  | "renameFolder"
  | "deleteFolder"
  | "resetLibraryMeta"
>;

export function useMapLibraryDialogState(options: {
  library: MapLibraryOperations;
  maps: readonly MapIndexEntry[]; // 表示順
  trashEntries: readonly MapTrashEntry[]; // 表示順
  libraryMeta: MapLibraryMetaV1;
  startupNotice: OperationNotice | null;
}): UseMapLibraryDialogStateResult {
  const { library, maps, trashEntries, libraryMeta, startupNotice } = options;
  const [state, setState] = useState<DialogState>(INITIAL_STATE);
  const [listTab, setListTabState] = useState<MapListTab>("all");
  const [folderFilter, setFolderFilterState] = useState<MapListFolderFilter>(ALL_FOLDERS_FILTER);
  // 操作の関数を描画ごとに変えないため、最新の値は layout effect で ref へ同期する（L-467, L-468, L-521）
  const libraryRef = useRef(library);
  const mapsRef = useRef(maps);
  const trashEntriesRef = useRef(trashEntries);
  const libraryMetaRef = useRef(libraryMeta);
  const listTabRef = useRef<MapListTab>("all");
  const folderFilterRef = useRef<MapListFolderFilter>(ALL_FOLDERS_FILTER);
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

  // 選択中フォルダーがメタデータから消えた場合は全件フィルタへ戻す（L-475, L-521）
  const isSelectedFolderMissing =
    folderFilter.kind === "folder" &&
    !libraryMeta.folders.some((folder) => folder.id === folderFilter.folderId);
  if (isSelectedFolderMissing) {
    setFolderFilterState(ALL_FOLDERS_FILTER);
  }
  const effectiveFolderFilter = isSelectedFolderMissing ? ALL_FOLDERS_FILTER : folderFilter;

  useLayoutEffect(() => {
    libraryRef.current = library;
    mapsRef.current = maps;
    trashEntriesRef.current = trashEntries;
    libraryMetaRef.current = libraryMeta;
    listTabRef.current = listTab;
    folderFilterRef.current = effectiveFolderFilter;
  }, [library, maps, trashEntries, libraryMeta, listTab, effectiveFolderFilter]);

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

  // 操作前の絞り込み済み表示配列。行が消える操作の戻し先はこの配列で決める（L-460）
  const currentVisibleMaps = useCallback(
    () =>
      filterAndSortMapsForList(mapsRef.current, libraryMetaRef.current, {
        tab: listTabRef.current,
        folderFilter: folderFilterRef.current,
      }),
    [],
  );

  // 一覧の行に対するメタデータ操作の結果。行が消えたときだけ戻し先へフォーカスを移す
  const finishListRowMetaAction = useCallback(
    (result: MapLibraryOperationResult, focusAfterRemoval: MapLibraryDialogFocusTarget | null) => {
      if (result.ok && focusAfterRemoval !== null) {
        transition({ kind: "list" });
        setState((prev) => returnToList(prev, result, focusAfterRemoval));
        return;
      }
      setState((prev) => stayWithResult(prev, result));
    },
    [transition],
  );

  const setListTab = useCallback((tab: MapListTab) => {
    listTabRef.current = tab;
    setListTabState(tab);
  }, []);

  const setFolderFilter = useCallback((filter: MapListFolderFilter) => {
    folderFilterRef.current = filter;
    setFolderFilterState(filter);
  }, []);

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

  const openFolders = useCallback(
    () => openDialogScreen({ kind: "folders" }),
    [openDialogScreen],
  );

  const openFolderRename = useCallback(
    (folderId: string) => openDialogScreen({ kind: "folderRename", folderId }),
    [openDialogScreen],
  );

  const openFolderDelete = useCallback(
    (folderId: string) => openDialogScreen({ kind: "folderDeleteConfirm", folderId }),
    [openDialogScreen],
  );

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

  const closeSilently = useCallback(() => {
    transition({ kind: "closed" });
    setState(closeDialogSilently);
  }, [transition]);

  const publishShellNotice = useCallback((notice: OperationNotice) => {
    setState((prev) => publishShellNoticeState(prev, notice));
  }, []);

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
      // 戻し先は削除前の絞り込み済み表示配列で決める（L-460）
      const focusAfterRemoval = selectFocusAfterRemoval(currentVisibleMaps(), mapId);
      const result = deleteOperation(mapId);
      const nextScreen = nextScreenAfterActiveDeletion(result, mapId);
      if (nextScreen !== null) transition(nextScreen);
      setState((prev) => returnAfterActiveDeletion(prev, result, mapId, focusAfterRemoval));
    },
    [currentVisibleMaps, transition],
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

  const toggleFavorite = useCallback((mapId: string) => {
    const focusAfterRemoval = selectFocusAfterFavoriteToggle(
      currentVisibleMaps(),
      libraryMetaRef.current,
      listTabRef.current,
      mapId,
    );
    const result = libraryRef.current.toggleFavorite(mapId);
    finishListRowMetaAction(result, focusAfterRemoval);
  }, [currentVisibleMaps, finishListRowMetaAction]);

  const assignFolder = useCallback((mapId: string, folderId: string | null) => {
    const focusAfterRemoval = selectFocusAfterFolderAssign(
      currentVisibleMaps(),
      folderFilterRef.current,
      mapId,
      folderId,
    );
    const result = libraryRef.current.assignFolder(mapId, folderId);
    finishListRowMetaAction(result, focusAfterRemoval);
  }, [currentVisibleMaps, finishListRowMetaAction]);

  const submitCreateFolder = useCallback((nameInput: string): boolean => {
    const result = libraryRef.current.createFolder(nameInput);
    if (!result.ok) {
      setState((prev) => showFailure(prev, result.notice));
      return false;
    }
    transition({ kind: "folders" });
    setState((prev) => returnToFoldersAfterAction(prev, result, { kind: "folderCreateInput" }));
    return true;
  }, [transition]);

  const submitRenameFolder = useCallback((folderId: string, nameInput: string) => {
    const result = libraryRef.current.renameFolder(folderId, nameInput);
    if (result.ok) transition({ kind: "folders" });
    setState((prev) =>
      result.ok
        ? returnToFoldersAfterAction(prev, result, {
          kind: "folderRow",
          folderId,
          action: "rename",
        })
        : showFailure(prev, result.notice),
    );
  }, [transition]);

  const confirmDeleteFolder = useCallback((folderId: string) => {
    const focusAfterRemoval = selectFocusAfterFolderRemoval(
      libraryMetaRef.current.folders,
      folderId,
    );
    const result = libraryRef.current.deleteFolder(folderId);
    if (!result.ok) {
      setState((prev) => showFailure(prev, result.notice));
      return;
    }
    // 選択中フォルダーを削除したら全件フィルタへ戻す（L-475）
    if (
      folderFilterRef.current.kind === "folder" &&
      folderFilterRef.current.folderId === folderId
    ) {
      folderFilterRef.current = ALL_FOLDERS_FILTER;
      setFolderFilterState(ALL_FOLDERS_FILTER);
    }
    transition({ kind: "folders" });
    setState((prev) => returnToFoldersAfterAction(prev, result, focusAfterRemoval));
  }, [transition]);

  const resetLibraryMeta = useCallback(() => {
    const result = libraryRef.current.resetLibraryMeta();
    if (!result.ok) {
      setState((prev) => stayWithResult(prev, result));
      return;
    }
    if (folderFilterRef.current.kind === "folder") {
      folderFilterRef.current = ALL_FOLDERS_FILTER;
      setFolderFilterState(ALL_FOLDERS_FILTER);
    }
    // 破損バナーが DOM から消えるため、一覧の「フォルダー管理」ボタンへフォーカスを戻す（L-397）
    transition({ kind: "list" });
    setState((prev) => returnToList(prev, result, { kind: "folderButton" }));
  }, [transition]);

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
    listTab,
    setListTab,
    folderFilter: effectiveFolderFilter,
    setFolderFilter,
    openList,
    openCreateFromHeader,
    openCreateFromList,
    openRename,
    openDelete,
    openTrash,
    openFolders,
    openFolderRename,
    openFolderDelete,
    back,
    close,
    closeSilently,
    publishShellNotice,
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
    toggleFavorite,
    assignFolder,
    submitCreateFolder,
    submitRenameFolder,
    confirmDeleteFolder,
    resetLibraryMeta,
    prepareBackup,
    downloadBackup,
    selectRestoreFile,
    confirmRestore,
    moveBranchToMap,
    consumeFocusTarget,
    consumeHeaderFocusRequest,
  };
}
