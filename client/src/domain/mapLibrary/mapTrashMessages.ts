import type { OperationNotice } from "@/types/operationNotice";
import { DEFAULT_MAP_NAME } from "./mapName";

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

// ゴミ箱移動時の失敗・容量不足・破損
export function trashMoveFailedNotice(): OperationNotice {
  return error("マップをゴミ箱へ移動できませんでした。");
}

export function trashQuotaExceededNotice(): OperationNotice {
  return error(
    "保存容量が不足しているため、マップをゴミ箱へ移動できませんでした。ゴミ箱の容量を空けるか、ゴミ箱に入れずに完全に削除してください。",
  );
}

export function trashBodyReadFailedForMoveNotice(): OperationNotice {
  return error(
    "マップの保存データを読み取れないため、ゴミ箱へ移動できませんでした。ゴミ箱に入れずに完全に削除してください。",
  );
}

export function trashCorruptForMoveNotice(): OperationNotice {
  return error(
    "ゴミ箱のデータが破損しているため、マップをゴミ箱へ移動できませんでした。ゴミ箱を空にするか、ゴミ箱に入れずに完全に削除してください。",
  );
}

export function trashMoveRollbackFailedNotice(): OperationNotice {
  return error(
    "マップの削除に失敗し、ゴミ箱への移動の取り消しにも失敗しました。ページを再読み込みしてゴミ箱を確認してください。",
  );
}

export const TRASH_CORRUPT_MESSAGE =
  "ゴミ箱の読み込みに失敗しました。ゴミ箱を空にして初期化してください。";

export function trashCorruptNotice(): OperationNotice {
  return error(TRASH_CORRUPT_MESSAGE);
}

// ゴミ箱からの復元
export function trashRestoredNotice(name: string): OperationNotice {
  return status(`マップ「${name}」をマップ一覧に復元しました。`);
}

export function trashRestoredCleanupFailedNotice(
  name: string,
): OperationNotice {
  return warning(
    `マップ「${name}」をマップ一覧に復元しましたが、ゴミ箱の後始末に失敗しました。`,
  );
}

export function trashEntryNotFoundNotice(): OperationNotice {
  return error("対象のマップはゴミ箱に見つかりませんでした。");
}

export function trashRestoreBodyReadFailedNotice(): OperationNotice {
  return error(
    "ゴミ箱のマップデータを読み取れなかったため、復元できませんでした。",
  );
}

export function trashRestoreBodyMissingNotice(): OperationNotice {
  return error(
    "ゴミ箱のマップ本体が見つからないため、復元できませんでした。",
  );
}

export function trashRestoreBodyCorruptNotice(): OperationNotice {
  return error(
    "ゴミ箱のマップデータが破損しているため、復元できませんでした。",
  );
}

export function trashRestoreIndexChangedNotice(): OperationNotice {
  return error(
    "マップ一覧が変更または更新されたため復元できませんでした。ページを再読み込みしてからやり直してください。",
  );
}

export function trashRestoreWriteFailedNotice(): OperationNotice {
  return error(
    "マップを復元できませんでした。不要なマップやゴミ箱のデータを削除してからやり直してください。",
  );
}

export function trashRestoreRollbackFailedNotice(): OperationNotice {
  return error(
    "マップ一覧の保存に失敗し、復元途中のデータの取り消しにも失敗しました。ページを再読み込みして状態を確認してください。",
  );
}

// ゴミ箱からの個別完全削除
export function trashEntryPermanentlyDeletedNotice(
  name: string,
): OperationNotice {
  return status(`マップ「${name}」を完全に削除しました。`);
}

export function trashEntryPermanentlyDeletedBodyWarningNotice(
  name: string,
): OperationNotice {
  return warning(
    `マップ「${name}」をゴミ箱から削除しましたが、${PARTIAL_REMOVAL}`,
  );
}

export function trashPermanentDeleteFailedNotice(): OperationNotice {
  return error("ゴミ箱からマップを完全に削除できませんでした。");
}

// ゴミ箱を空にする・破損データ初期化
export function trashEmptiedNotice(): OperationNotice {
  return status("ゴミ箱を空にしました。");
}

export function trashEmptyPartialWarningNotice(): OperationNotice {
  return warning(
    "ゴミ箱の一部データを削除できませんでした。残った項目を確認してください。",
  );
}

export function trashEmptyFailedNotice(): OperationNotice {
  return error("ゴミ箱を空にできませんでした。");
}

export function trashCorruptClearedNotice(): OperationNotice {
  return status("壊れたゴミ箱のデータを初期化しました。");
}

export function trashCorruptClearFailedNotice(): OperationNotice {
  return error("ゴミ箱のデータを初期化できませんでした。");
}

// フォールバック完全削除（permanentlyDeleteMap）
export function mapPermanentlyDeletedNotice(name: string): OperationNotice {
  return status(`マップ「${name}」を完全に削除しました。`);
}

export function currentMapPermanentlyDeletedNotice(
  name: string,
  nextName: string,
): OperationNotice {
  return status(
    `マップ「${name}」を完全に削除し、「${nextName}」を開きました。`,
  );
}

export function lastMapPermanentlyDeletedNotice(
  name: string,
): OperationNotice {
  return status(
    `マップ「${name}」を完全に削除し、新しい「${DEFAULT_MAP_NAME}」を作成しました。`,
  );
}

export function permanentBodyRemovalFailedNotice(
  name: string,
): OperationNotice {
  return warning(
    `マップ「${name}」を一覧から完全に削除しましたが、${PARTIAL_REMOVAL}`,
  );
}

export function currentPermanentBodyRemovalFailedNotice(
  name: string,
  nextName: string,
): OperationNotice {
  return warning(
    `マップ「${name}」を一覧から完全に削除し、「${nextName}」を開きましたが、${PARTIAL_REMOVAL}`,
  );
}

export function lastPermanentBodyRemovalFailedNotice(
  name: string,
): OperationNotice {
  return warning(
    `マップ「${name}」を一覧から完全に削除し、新しい「${DEFAULT_MAP_NAME}」を作成しましたが、${PARTIAL_REMOVAL}`,
  );
}
