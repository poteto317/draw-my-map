import type { OperationNotice } from "@/types/operationNotice";
import { DEFAULT_MAP_NAME } from "./mapName";

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
  return status(`マップ「${name}」を削除しました。`);
}

export function currentMapDeletedNotice(
  name: string,
  nextName: string,
): OperationNotice {
  return status(`マップ「${name}」を削除し、「${nextName}」を開きました。`);
}

export function lastMapDeletedNotice(name: string): OperationNotice {
  return status(
    `マップ「${name}」を削除し、新しい「${DEFAULT_MAP_NAME}」を作成しました。`,
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
