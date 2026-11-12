import type { OperationNotice } from "@/types/operationNotice";

// 4.1 節: 競合通知・削除通知・外部更新通知メッセージ
export const CONFLICT_NOTICE_MESSAGE =
  "別タブでこのマップが更新されました。上書きを防ぐため自動保存を停止しています。";
export const EXTERNALLY_DELETED_NOTICE_MESSAGE =
  "このマップは別タブで削除されました。";
export const EXTERNAL_UPDATE_NOTICE_MESSAGE =
  "別タブでこのマップが更新されました。";

// 4.1 節: ボタンラベル
export const SAVE_AS_COPY_BUTTON_LABEL = "別名で保存";
export const RELOAD_EXTERNAL_BUTTON_LABEL = "最新を読み込む";
export const RELOAD_EXTERNAL_CONTENT_BUTTON_LABEL = "最新の内容を読み込む";
export const EXPORT_JSON_BUTTON_LABEL = "JSON書き出し";

// 4.2 節: 確認ダイアログ・リロード完了文言
export const RELOAD_CONFIRM_MESSAGE =
  "現在のタブの未保存の変更は失われます。別タブの最新内容を読み込みますか？";
export const RELOAD_CONFIRM_TITLE = "最新の内容を読み込む";
export const RELOAD_CONFIRM_ACTION_LABEL = "最新の内容を読み込む";
export const RELOAD_CONFIRM_CANCEL_LABEL = "キャンセル";
export const RELOAD_SUCCESS_MESSAGE = "別タブの最新内容を読み込みました。";

// 3.3 節: 競合中の操作拒否・中断通知メッセージ
export const CONFLICT_SWITCH_MAP_REJECTED_MESSAGE =
  "競合中のため切り替えられません。『別名で保存』または『最新を読み込む』で解決してください。";
export const CONFLICT_MOVE_BRANCH_REJECTED_MESSAGE =
  "別タブでマップが更新または削除されているため、枝を移動できませんでした。";
export const CONFLICT_RESTORE_REJECTED_MESSAGE =
  "別タブで競合または更新が発生しているため、一括復元できませんでした。";

function status(message: string): OperationNotice {
  return { kind: "status", message };
}

function warning(message: string): OperationNotice {
  return { kind: "warning", message };
}

function error(message: string): OperationNotice {
  return { kind: "error", message };
}

export function conflictNotice(): OperationNotice {
  return warning(CONFLICT_NOTICE_MESSAGE);
}

export function externallyDeletedNotice(): OperationNotice {
  return error(EXTERNALLY_DELETED_NOTICE_MESSAGE);
}

export function externalUpdateNotice(): OperationNotice {
  return status(EXTERNAL_UPDATE_NOTICE_MESSAGE);
}

export function conflictReloadSuccessNotice(): OperationNotice {
  return status(RELOAD_SUCCESS_MESSAGE);
}

export function conflictSwitchMapRejectedNotice(): OperationNotice {
  return warning(CONFLICT_SWITCH_MAP_REJECTED_MESSAGE);
}

export function conflictBranchMoveRejectedNotice(): OperationNotice {
  return error(CONFLICT_MOVE_BRANCH_REJECTED_MESSAGE);
}

export function conflictRestoreRejectedNotice(): OperationNotice {
  return error(CONFLICT_RESTORE_REJECTED_MESSAGE);
}
