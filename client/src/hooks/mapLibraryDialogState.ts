import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
import {
  getMapUserMeta,
  type MapFolder,
  type MapLibraryMetaV1,
  type MapListFolderFilter,
  type MapListTab,
} from "@/domain/mapLibrary/mapLibraryMeta";
import type { MapTrashEntry } from "@/domain/mapLibrary/mapTrash";
import type { MapLibraryOperationResult } from "@/hooks/mapLibraryState";
import type {
  MapLibraryDialogFocusTarget,
  MapLibraryDialogNotices,
  MapLibraryDialogScreen,
  OpenMapLibraryDialogScreen,
} from "@/types/mapLibraryDialog";
import type { OperationNotice, ShellNotice } from "@/types/operationNotice";

// "export" は保護モードの戻し先。「マップ一覧」「新しいマップ」が無効になり、案内する書き出しの入口へ移す
export type HeaderFocusRequest = "list" | "create" | "export";

export type DialogState = {
  screen: MapLibraryDialogScreen;
  notices: MapLibraryDialogNotices;
  focusTarget: MapLibraryDialogFocusTarget | null;
  headerFocusRequest: HeaderFocusRequest | null;
  shellNotice: ShellNotice | null;
  // 起動の結果は1回だけ確定するので、シェルの通知に出すのも1回だけ
  startupNoticeShown: boolean;
};

const SCREEN_DEFAULT: MapLibraryDialogFocusTarget = { kind: "screenDefault" };

export const INITIAL_STATE: DialogState = {
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

// ゴミ箱から除いた行の次の行の「復元」。無ければ前の行、どちらも無ければ「一覧に戻る」
export function selectFocusAfterTrashRemoval(
  entries: readonly MapTrashEntry[],
  removedTrashId: string,
): MapLibraryDialogFocusTarget {
  const index = entries.findIndex((entry) => entry.id === removedTrashId);
  const neighbor = index === -1 ? undefined : (entries[index + 1] ?? entries[index - 1]);
  return neighbor === undefined
    ? { kind: "backToListButton" }
    : { kind: "trashRow", trashId: neighbor.id, action: "restore" };
}

// アーカイブ／解除で一覧の行が消えるときの戻し先。行が残るなら null（L-460）
export function selectFocusAfterArchiveToggle(
  visibleMaps: readonly MapIndexEntry[],
  meta: MapLibraryMetaV1,
  listTab: MapListTab,
  mapId: string,
  willArchive: boolean,
): MapLibraryDialogFocusTarget | null {
  const userMeta = getMapUserMeta(meta, mapId);
  const willRowDisappear =
    (listTab !== "archived" && willArchive && visibleMaps.some((map) => map.id === mapId))
    || (listTab === "archived"
      && !willArchive
      && userMeta?.archivedAt !== undefined
      && visibleMaps.some((map) => map.id === mapId));
  return willRowDisappear ? selectFocusAfterRemoval(visibleMaps, mapId) : null;
}

// お気に入りの切り替えで一覧の行が消える（お気に入りタブで解除する）ときの戻し先。
// visibleMaps は操作前の絞り込み済み表示配列。行が残るなら null（L-460）
export function selectFocusAfterFavoriteToggle(
  visibleMaps: readonly MapIndexEntry[],
  meta: MapLibraryMetaV1,
  listTab: MapListTab,
  mapId: string,
): MapLibraryDialogFocusTarget | null {
  const willRowDisappear =
    listTab === "favorites"
    && getMapUserMeta(meta, mapId)?.favorite === true
    && visibleMaps.some((map) => map.id === mapId);
  return willRowDisappear ? selectFocusAfterRemoval(visibleMaps, mapId) : null;
}

// フォルダーの割り当てで、絞り込み中の一覧から行が消えるときの戻し先。行が残るなら null（L-460）
export function selectFocusAfterFolderAssign(
  visibleMaps: readonly MapIndexEntry[],
  folderFilter: MapListFolderFilter,
  mapId: string,
  folderId: string | null,
): MapLibraryDialogFocusTarget | null {
  const leavesFilter =
    (folderFilter.kind === "folder" && folderId !== folderFilter.folderId)
    || (folderFilter.kind === "unclassified" && folderId !== null);
  const willRowDisappear = leavesFilter && visibleMaps.some((map) => map.id === mapId);
  return willRowDisappear ? selectFocusAfterRemoval(visibleMaps, mapId) : null;
}

// フォルダー削除後のフォーカス先。次行・前行の「名前を変更」、どちらも無ければ新規作成入力欄
export function selectFocusAfterFolderRemoval(
  folders: readonly MapFolder[],
  removedFolderId: string,
): MapLibraryDialogFocusTarget {
  const index = folders.findIndex((folder) => folder.id === removedFolderId);
  const neighbor = index === -1 ? undefined : (folders[index + 1] ?? folders[index - 1]);
  return neighbor === undefined
    ? { kind: "folderCreateInput" }
    : { kind: "folderRow", folderId: neighbor.id, action: "rename" };
}

// 通知を出すたび（空にするときも）sequence を進め、同じ文言の失敗が続いても読み上げ直させる（L-166）
export function nextNotices(
  state: DialogState,
  status: string,
  alert: string,
): MapLibraryDialogNotices {
  return { status, alert, sequence: state.notices.sequence + 1 };
}

export function openScreen(
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

export function closeDialog(state: DialogState, request: HeaderFocusRequest): DialogState {
  return {
    ...state,
    screen: { kind: "closed" },
    notices: nextNotices(state, "", ""),
    focusTarget: null,
    headerFocusRequest: request,
  };
}

// 他ダイアログへの遷移時など、ヘッダーへのフォーカス要求を立てずにダイアログを閉じる
export function closeDialogSilently(state: DialogState): DialogState {
  return {
    ...state,
    screen: { kind: "closed" },
    notices: nextNotices(state, "", ""),
    focusTarget: null,
    headerFocusRequest: null,
  };
}

export function nextShellNotice(state: DialogState, notice: OperationNotice): ShellNotice {
  return { sequence: (state.shellNotice?.sequence ?? 0) + 1, notice };
}

export function publishShellNoticeState(
  state: DialogState,
  notice: OperationNotice,
): DialogState {
  return { ...state, shellNotice: nextShellNotice(state, notice) };
}

// 画面とフォーカス先は変えず、文言だけを alert に出す
export function showFailure(state: DialogState, notice: OperationNotice): DialogState {
  return { ...state, notices: nextNotices(state, "", notice.message) };
}

// 画面とフォーカス先を維持したまま、結果の通知だけを更新する（お気に入り・フォルダー割当・初期化など）
export function stayWithResult(
  state: DialogState,
  result: MapLibraryOperationResult,
): DialogState {
  if (!result.ok) {
    return showFailure(state, result.notice);
  }
  const { notice, saveRetryNotice } = result;
  if (notice === null && saveRetryNotice === null) {
    return state;
  }
  const alerts = [
    notice !== null && notice.kind !== "status" ? notice.message : null,
    saveRetryNotice?.message ?? null,
  ].filter((message): message is string => message !== null);
  return {
    ...state,
    notices: nextNotices(
      state,
      notice?.kind === "status" ? notice.message : "",
      alerts.join(" "),
    ),
  };
}

// 再マウントを伴う成功はシェルの通知に出し、ダイアログ内には重ねない（L-249）
export function closeAfterSuccess(
  state: DialogState,
  result: Extract<MapLibraryOperationResult, { ok: true }>,
): DialogState {
  const closed = closeDialog(state, "list");
  if (!result.remounted || result.notice === null) return closed;
  return { ...closed, shellNotice: nextShellNotice(state, result.notice) };
}

// 再マウントを伴う失敗（保護モードへの移行）も、シェルの通知だけが利用者に届く
export function closeAfterEnteringProtectedMode(
  state: DialogState,
  notice: OperationNotice,
): DialogState {
  return { ...closeDialog(state, "export"), shellNotice: nextShellNotice(state, notice) };
}

export function shouldCloseScreenAfterBranchMapOperation(
  result: MapLibraryOperationResult,
): boolean {
  return result.ok || result.enteredProtectedMode === true;
}

export function nextStateAfterBranchMapOperation(
  state: DialogState,
  result: MapLibraryOperationResult,
): DialogState {
  if (result.ok) return closeAfterSuccess(state, result);
  return result.enteredProtectedMode
    ? closeAfterEnteringProtectedMode(state, result.notice)
    : state;
}

// 指定した画面に戻る成功。status 以外の通知と保存の再試行の失敗は alert に出す
function returnToScreen(
  state: DialogState,
  screen: OpenMapLibraryDialogScreen,
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
    screen,
    notices: nextNotices(
      state,
      notice?.kind === "status" ? notice.message : "",
      alerts.join(" "),
    ),
    focusTarget,
  };
}

export function returnToList(
  state: DialogState,
  result: Extract<MapLibraryOperationResult, { ok: true }>,
  focusTarget: MapLibraryDialogFocusTarget,
): DialogState {
  return returnToScreen(state, { kind: "list" }, result, focusTarget);
}

export function returnToTrashAfterAction(
  state: DialogState,
  result: MapLibraryOperationResult,
  focusTarget: MapLibraryDialogFocusTarget,
): DialogState {
  if (!result.ok) {
    return {
      ...state,
      screen: { kind: "trash" },
      notices: nextNotices(state, "", result.notice.message),
      focusTarget,
    };
  }
  return returnToScreen(state, { kind: "trash" }, result, focusTarget);
}

export function returnToFoldersAfterAction(
  state: DialogState,
  result: MapLibraryOperationResult,
  focusTarget: MapLibraryDialogFocusTarget,
): DialogState {
  if (!result.ok) {
    return {
      ...state,
      screen: { kind: "folders" },
      notices: nextNotices(state, "", result.notice.message),
      focusTarget,
    };
  }
  return returnToScreen(state, { kind: "folders" }, result, focusTarget);
}

/** アクティブマップ削除結果に応じた次の遷移先画面を返す（画面変更なしの場合は null）。 */
export function nextScreenAfterActiveDeletion(
  result: MapLibraryOperationResult,
  mapId: string,
): MapLibraryDialogScreen | null {
  if (!result.ok) {
    if (result.enteredProtectedMode) return { kind: "closed" };
    if (result.canPermanentDelete) {
      return { kind: "delete", mapId, allowPermanentDelete: true };
    }
    return null;
  }
  return result.remounted ? { kind: "closed" } : { kind: "list" };
}

/** アクティブマップ削除結果に応じた次のダイアログ状態を返す。 */
export function returnAfterActiveDeletion(
  state: DialogState,
  result: MapLibraryOperationResult,
  mapId: string,
  focusTarget: MapLibraryDialogFocusTarget,
): DialogState {
  if (!result.ok) {
    if (result.enteredProtectedMode) {
      return closeAfterEnteringProtectedMode(state, result.notice);
    }
    if (result.canPermanentDelete) {
      return {
        ...state,
        screen: { kind: "delete", mapId, allowPermanentDelete: true },
        notices: nextNotices(state, "", result.notice.message),
      };
    }
    return showFailure(state, result.notice);
  }
  return result.remounted
    ? closeAfterSuccess(state, result)
    : returnToList(state, result, focusTarget);
}

// 一覧・ゴミ箱へ戻るときは、戻った後の通知だけを残す
export function backToList(
  state: DialogState,
  focusTarget: MapLibraryDialogFocusTarget,
  alertMessage = "",
): DialogState {
  return {
    ...state,
    screen: { kind: "list" },
    notices: nextNotices(state, "", alertMessage),
    focusTarget,
  };
}

function backToTrash(
  state: DialogState,
  focusTarget: MapLibraryDialogFocusTarget,
): DialogState {
  return { ...state, screen: { kind: "trash" }, notices: nextNotices(state, "", ""), focusTarget };
}

function backToFolders(
  state: DialogState,
  focusTarget: MapLibraryDialogFocusTarget,
): DialogState {
  return { ...state, screen: { kind: "folders" }, notices: nextNotices(state, "", ""), focusTarget };
}

export function nextScreenOnBack(screen: MapLibraryDialogScreen): MapLibraryDialogScreen {
  switch (screen.kind) {
    case "closed":
    case "list":
      return { kind: "closed" };
    case "create":
      return screen.origin === "header" ? { kind: "closed" } : { kind: "list" };
    case "trashPermanentDelete":
    case "trashEmptyConfirm":
      return { kind: "trash" };
    case "folderRename":
    case "folderDeleteConfirm":
      return { kind: "folders" };
    case "rename":
    case "delete":
    case "trash":
    case "folders":
    case "backupConfirm":
    case "restoreReading":
    case "restoreConfirm":
      return { kind: "list" };
  }
}

export function backFrom(state: DialogState): DialogState {
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
    case "trash":
      return backToList(state, { kind: "trashButton" });
    case "trashPermanentDelete":
      return backToTrash(state, {
        kind: "trashRow",
        trashId: screen.trashId,
        action: "permanentDelete",
      });
    case "trashEmptyConfirm":
      return backToTrash(state, { kind: "emptyTrashButton" });
    case "folders":
      return backToList(state, { kind: "folderButton" });
    case "folderRename":
      return backToFolders(state, {
        kind: "folderRow",
        folderId: screen.folderId,
        action: "rename",
      });
    case "folderDeleteConfirm":
      return backToFolders(state, {
        kind: "folderRow",
        folderId: screen.folderId,
        action: "delete",
      });
    case "backupConfirm":
      return backToList(state, { kind: "backupButton" });
    case "restoreReading":
    case "restoreConfirm":
      return backToList(state, { kind: "restoreButton" });
  }
}
