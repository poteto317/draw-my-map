import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
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

export function nextShellNotice(state: DialogState, notice: OperationNotice): ShellNotice {
  return { sequence: (state.shellNotice?.sequence ?? 0) + 1, notice };
}

// 画面とフォーカス先は変えず、文言だけを alert に出す
export function showFailure(state: DialogState, notice: OperationNotice): DialogState {
  return { ...state, notices: nextNotices(state, "", notice.message) };
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
    case "rename":
    case "delete":
    case "trash":
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
    case "backupConfirm":
      return backToList(state, { kind: "backupButton" });
    case "restoreReading":
    case "restoreConfirm":
      return backToList(state, { kind: "restoreButton" });
  }
}
