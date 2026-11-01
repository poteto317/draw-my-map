"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { ShellNotice } from "@/components/layout/MapLibraryNoticeRegion";
import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
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
import type { OperationNotice } from "@/types/operationNotice";

// "export" は保護モードの戻し先。「マップ一覧」「新しいマップ」が無効になり、案内する書き出しの入口へ移す
export type HeaderFocusRequest = "list" | "create" | "export";

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
  back: () => void; // Escape と「キャンセル」の共通処理
  close: () => void; // 一覧の「閉じる」
  submitCreate: (nameInput: string) => void;
  switchTo: (mapId: string) => void;
  submitRename: (mapId: string, nameInput: string) => void;
  confirmDelete: (mapId: string) => void;
  moveBranchToMap: UseMapLibraryResult["moveBranchToMap"];
  consumeFocusTarget: () => void;
  consumeHeaderFocusRequest: () => void;
};

type MapLibraryOperations = Pick<
  UseMapLibraryResult,
  "createMap" | "switchMap" | "renameMap" | "deleteMap" | "moveBranchToMap"
>;

type DialogState = {
  screen: MapLibraryDialogScreen;
  notices: MapLibraryDialogNotices;
  focusTarget: MapLibraryDialogFocusTarget | null;
  headerFocusRequest: HeaderFocusRequest | null;
  shellNotice: ShellNotice | null;
  // 起動の結果は1回だけ確定するので、シェルの通知に出すのも1回だけ
  startupNoticeShown: boolean;
};

const SCREEN_DEFAULT: MapLibraryDialogFocusTarget = { kind: "screenDefault" };

const INITIAL_STATE: DialogState = {
  screen: { kind: "closed" },
  notices: { status: "", alert: "", sequence: 0 },
  focusTarget: null,
  headerFocusRequest: null,
  shellNotice: null,
  startupNoticeShown: false,
};

// 削除した行の次の行の「開く」。無ければ前の行、どちらも無ければ一覧の「新しいマップ」
export function selectFocusAfterRemoval(
  maps: readonly MapIndexEntry[],
  removedId: string,
): MapLibraryDialogFocusTarget {
  const index = maps.findIndex((map) => map.id === removedId);
  const neighbor = index === -1 ? undefined : (maps[index + 1] ?? maps[index - 1]);
  return neighbor === undefined
    ? { kind: "listCreateButton" }
    : { kind: "row", mapId: neighbor.id, action: "open" };
}

// 通知を出すたび（空にするときも）sequence を進め、同じ文言の失敗が続いても読み上げ直させる（L-166）
function nextNotices(
  state: DialogState,
  status: string,
  alert: string,
): MapLibraryDialogNotices {
  return { status, alert, sequence: state.notices.sequence + 1 };
}

function openScreen(
  state: DialogState,
  screen: OpenMapLibraryDialogScreen,
): DialogState {
  return {
    ...state,
    screen,
    notices: nextNotices(state, "", ""),
    focusTarget: SCREEN_DEFAULT,
    headerFocusRequest: null,
  };
}

function closeDialog(state: DialogState, request: HeaderFocusRequest): DialogState {
  return {
    ...state,
    screen: { kind: "closed" },
    notices: nextNotices(state, "", ""),
    focusTarget: null,
    headerFocusRequest: request,
  };
}

function nextShellNotice(state: DialogState, notice: OperationNotice): ShellNotice {
  return { sequence: (state.shellNotice?.sequence ?? 0) + 1, notice };
}

// 画面とフォーカス先は変えず、文言だけを alert に出す
function showFailure(state: DialogState, notice: OperationNotice): DialogState {
  return { ...state, notices: nextNotices(state, "", notice.message) };
}

// 再マウントを伴う成功はシェルの通知に出し、ダイアログ内には重ねない（L-249）
function closeAfterSuccess(
  state: DialogState,
  result: Extract<MapLibraryOperationResult, { ok: true }>,
): DialogState {
  const closed = closeDialog(state, "list");
  if (!result.remounted || result.notice === null) return closed;
  return { ...closed, shellNotice: nextShellNotice(state, result.notice) };
}

// 再マウントを伴う失敗（保護モードへの移行）も、シェルの通知だけが利用者に届く
function closeAfterEnteringProtectedMode(state: DialogState, notice: OperationNotice): DialogState {
  return { ...closeDialog(state, "export"), shellNotice: nextShellNotice(state, notice) };
}

// 一覧に戻る成功。status 以外の通知と保存の再試行の失敗は alert に出す
function returnToList(
  state: DialogState,
  result: Extract<MapLibraryOperationResult, { ok: true }>,
  focusTarget: MapLibraryDialogFocusTarget,
): DialogState {
  const { notice, saveRetryNotice } = result;
  const alerts = [
    notice !== null && notice.kind !== "status" ? notice.message : null,
    saveRetryNotice?.message ?? null,
  ].filter((message): message is string => message !== null);
  return {
    ...state,
    screen: { kind: "list" },
    notices: nextNotices(
      state,
      notice?.kind === "status" ? notice.message : "",
      alerts.join(" "),
    ),
    focusTarget,
  };
}

// 一覧へ戻るときは、戻る前の画面の通知を残さない
function backToList(state: DialogState, focusTarget: MapLibraryDialogFocusTarget): DialogState {
  return { ...state, screen: { kind: "list" }, notices: nextNotices(state, "", ""), focusTarget };
}

function backFrom(state: DialogState): DialogState {
  const { screen } = state;
  switch (screen.kind) {
    case "closed":
      return state;
    case "list":
      return closeDialog(state, "list");
    case "create":
      return screen.origin === "header"
        ? closeDialog(state, "create")
        : backToList(state, { kind: "listCreateButton" });
    case "rename":
    case "delete":
      return backToList(state, { kind: "row", mapId: screen.mapId, action: screen.kind });
  }
}

export function useMapLibraryDialogState(options: {
  library: MapLibraryOperations;
  maps: readonly MapIndexEntry[]; // 表示順
  startupNotice: OperationNotice | null;
}): UseMapLibraryDialogStateResult {
  const { library, maps, startupNotice } = options;
  const [state, setState] = useState<DialogState>(INITIAL_STATE);
  // 操作の関数を描画ごとに変えないため、最新の library と maps は ref から読む（L-521）
  const libraryRef = useRef(library);
  const mapsRef = useRef(maps);

  useLayoutEffect(() => {
    libraryRef.current = library;
    mapsRef.current = maps;
  }, [library, maps]);

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
    setState((prev) => openScreen(prev, { kind: "list" }));
  }, []);

  const openCreateFromHeader = useCallback(() => {
    setState((prev) => openScreen(prev, { kind: "create", origin: "header" }));
  }, []);

  const openCreateFromList = useCallback(() => {
    setState((prev) => openScreen(prev, { kind: "create", origin: "list" }));
  }, []);

  const openRename = useCallback((mapId: string) => {
    setState((prev) => openScreen(prev, { kind: "rename", mapId }));
  }, []);

  const openDelete = useCallback((mapId: string) => {
    setState((prev) => openScreen(prev, { kind: "delete", mapId }));
  }, []);

  const back = useCallback(() => {
    setState(backFrom);
  }, []);

  const close = useCallback(() => {
    setState((prev) => closeDialog(prev, "list"));
  }, []);

  const submitCreate = useCallback((nameInput: string) => {
    const result = libraryRef.current.createMap(nameInput);
    setState((prev) => (result.ok ? closeAfterSuccess(prev, result) : showFailure(prev, result.notice)));
  }, []);

  // 開いているマップは本物が「変化なし」（remounted: false）を返すので、何もせず閉じる
  const switchTo = useCallback((mapId: string) => {
    const result = libraryRef.current.switchMap(mapId);
    setState((prev) => (result.ok ? closeAfterSuccess(prev, result) : showFailure(prev, result.notice)));
  }, []);

  const submitRename = useCallback((mapId: string, nameInput: string) => {
    const result = libraryRef.current.renameMap(mapId, nameInput);
    setState((prev) =>
      result.ok
        ? returnToList(prev, result, { kind: "row", mapId, action: "rename" })
        : showFailure(prev, result.notice),
    );
  }, []);

  const confirmDelete = useCallback((mapId: string) => {
    // 戻し先は削除前の表示順で決める
    const focusAfterRemoval = selectFocusAfterRemoval(mapsRef.current, mapId);
    const result = libraryRef.current.deleteMap(mapId);
    setState((prev) => {
      if (!result.ok) return showFailure(prev, result.notice);
      return result.remounted
        ? closeAfterSuccess(prev, result)
        : returnToList(prev, result, focusAfterRemoval);
    });
  }, []);

  // ダイアログは MapEditor が持つ。再マウントしない失敗は結果を返すだけで、そちらのエラー表示に任せる
  const moveBranchToMap = useCallback((
    sourceSession: MapStorageSession,
    targetId: string,
    rootId: number,
  ): MapLibraryOperationResult => {
    const result = libraryRef.current.moveBranchToMap(sourceSession, targetId, rootId);
    setState((prev) => {
      if (result.ok) return closeAfterSuccess(prev, result);
      return result.enteredProtectedMode ? closeAfterEnteringProtectedMode(prev, result.notice) : prev;
    });
    return result;
  }, []);

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
    back,
    close,
    submitCreate,
    switchTo,
    submitRename,
    confirmDelete,
    moveBranchToMap,
    consumeFocusTarget,
    consumeHeaderFocusRequest,
  };
}
