import type { MapLibraryMetaStatus } from "@/domain/mapLibrary/mapLibraryMeta";
import type { OperationNotice } from "@/types/operationNotice";
import { DEFAULT_MAP_NAME } from "./mapName";

export const META_PROTECTED_UNAVAILABLE_MESSAGE =
  "保護モード中は、お気に入り・フォルダー・アーカイブ情報を変更できません。";

export const META_STATUS_CORRUPT_BLOCKED_MESSAGE =
  "お気に入り・フォルダー・アーカイブ情報が破損しているため操作できません。メタデータを初期化してから再試行してください。";

export const META_STATUS_UNAVAILABLE_BLOCKED_MESSAGE =
  "お気に入り・フォルダー・アーカイブ情報を読み込めなかったため操作できません。";

export const META_WRITE_FAILED_QUOTA_MESSAGE =
  "保存領域の空きが足りず、お気に入り・フォルダー・アーカイブ情報を保存できませんでした。不要なデータを減らして再試行してください。";

export const META_WRITE_FAILED_MESSAGE =
  "お気に入り・フォルダー・アーカイブ情報を保存できませんでした。再試行してください。";

export function metaProtectedUnavailableNotice(): OperationNotice {
  return { kind: "error", message: META_PROTECTED_UNAVAILABLE_MESSAGE };
}

export function metaStatusBlockedNotice(
  status: Exclude<MapLibraryMetaStatus, "ready">,
): OperationNotice {
  if (status === "corrupt") {
    return { kind: "error", message: META_STATUS_CORRUPT_BLOCKED_MESSAGE };
  }
  return { kind: "error", message: META_STATUS_UNAVAILABLE_BLOCKED_MESSAGE };
}

export function metaWriteFailedNotice(reason: "quota" | "write-error"): OperationNotice {
  if (reason === "quota") {
    return { kind: "error", message: META_WRITE_FAILED_QUOTA_MESSAGE };
  }
  return { kind: "error", message: META_WRITE_FAILED_MESSAGE };
}

// 自動保存と削除後の再試行の失敗で使う。
export const AUTO_SAVE_FAILURE_MESSAGE =
  "ブラウザへ自動保存できませんでした。不要なマップを削除するか、JSONで書き出してください。";

export type MapLibraryOperationName =
  "マップを作成" | "マップを切り替え" | "名前を変更" | "マップを削除";

const RECOVERY_HINT = "不要なマップを削除するか、JSONで書き出してください。";
const PARTIAL_REMOVAL = "保存データの一部を消せませんでした。";

function status(message: string): OperationNotice {
  return { kind: "status", message };
}

function warning(message: string): OperationNotice {
  return { kind: "warning", message };
}

function error(message: string): OperationNotice {
  return { kind: "error", message };
}

// 自動保存と削除後の保存の再試行の失敗。通知の形と判定を同じ場所で定める
export function autoSaveFailedNotice(): OperationNotice {
  return error(AUTO_SAVE_FAILURE_MESSAGE);
}

export function isAutoSaveFailedNotice(notice: OperationNotice | null): boolean {
  return notice?.kind === "error" && notice.message === AUTO_SAVE_FAILURE_MESSAGE;
}

export function mapCreatedNotice(name: string): OperationNotice {
  return status(`マップ「${name}」を作成しました。`);
}

export function mapSwitchedNotice(name: string): OperationNotice {
  return status(`マップ「${name}」を開きました。`);
}

export function mapRenamedNotice(name: string): OperationNotice {
  return status(`マップの名前を「${name}」に変更しました。`);
}

export function mapDeletedNotice(name: string): OperationNotice {
  return status(`マップ「${name}」をゴミ箱に移動しました。`);
}

export function currentMapDeletedNotice(
  name: string,
  nextName: string,
): OperationNotice {
  return status(`マップ「${name}」をゴミ箱に移動し、「${nextName}」を開きました。`);
}

export function lastMapDeletedNotice(name: string): OperationNotice {
  return status(
    `マップ「${name}」をゴミ箱に移動し、新しい「${DEFAULT_MAP_NAME}」を作成しました。`,
  );
}

export function switchFlushFailedNotice(): OperationNotice {
  return error(
    `現在のマップを保存できなかったため、マップを切り替えませんでした。${RECOVERY_HINT}`,
  );
}

export function createFlushFailedNotice(): OperationNotice {
  return error(
    `現在のマップを保存できなかったため、新しいマップを作成しませんでした。${RECOVERY_HINT}`,
  );
}

export function branchMoveFlushFailedNotice(): OperationNotice {
  return error("編集中のマップを保存できないため、枝を移動できませんでした。");
}

export function branchMoveRejectedNotice(): OperationNotice {
  return error("枝を移動できませんでした。移動元と移動先を確認してやり直してください。");
}

export function branchMovedToMapNotice(): OperationNotice {
  return status("枝を移動し、移動先のマップを開きました。");
}

export const CONFLICT_BRANCH_EXTRACT_REJECTED_MESSAGE =
  "別タブでマップが更新または削除されているため、枝を別マップに切り出せませんでした。";

export const BRANCH_EXTRACT_STORED_ERROR_MESSAGE =
  "枝を別マップに切り出せませんでした。保存データを確認してやり直してください。";

export function branchExtractStoredErrorMessage(): string {
  return BRANCH_EXTRACT_STORED_ERROR_MESSAGE;
}

export function conflictBranchExtractRejectedNotice(): OperationNotice {
  return error(CONFLICT_BRANCH_EXTRACT_REJECTED_MESSAGE);
}

export function branchExtractRejectedNotice(): OperationNotice {
  return error("枝を別マップに切り出せませんでした。切り出すノードとマップの状態を確認してやり直してください。");
}

export function branchExtractFlushFailedNotice(): OperationNotice {
  return error("編集中のマップを保存できないため、枝を別マップに切り出せませんでした。");
}

export function branchExtractedToMapNotice(): OperationNotice {
  return status("枝を別マップに切り出し、新しいマップを開きました。");
}

export function indexWriteFailedNotice(
  operation: MapLibraryOperationName,
): OperationNotice {
  return error(
    `マップの一覧を保存できなかったため、${operation}できませんでした。不要なマップを削除してください。`,
  );
}

export function bodyRemovalFailedNotice(name: string): OperationNotice {
  return warning(`マップ「${name}」を一覧から削除しましたが、${PARTIAL_REMOVAL}`);
}

export function currentBodyRemovalFailedNotice(
  name: string,
  nextName: string,
): OperationNotice {
  return warning(
    `マップ「${name}」を一覧から削除し、「${nextName}」を開きましたが、${PARTIAL_REMOVAL}`,
  );
}

export function lastBodyRemovalFailedNotice(name: string): OperationNotice {
  return warning(
    `マップ「${name}」を一覧から削除し、新しい「${DEFAULT_MAP_NAME}」を作成しましたが、${PARTIAL_REMOVAL}`,
  );
}

export function mapIdUnavailableNotice(): OperationNotice {
  return error("新しいマップを作成できませんでした。もう一度お試しください。");
}
