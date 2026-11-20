import type { OperationNotice } from "@/types/operationNotice";

function error(message: string): OperationNotice {
  return { kind: "error", message };
}

export function mapViewBookmarkReadFailedNotice(): OperationNotice {
  return error("表示ブックマークを読み込めませんでした。");
}

export function mapViewBookmarkEmptyNameNotice(): OperationNotice {
  return error("表示ブックマーク名を入力してください。");
}

export function mapViewBookmarkDuplicateNameNotice(): OperationNotice {
  return error("同じ名前の表示ブックマークがすでにあります。");
}

export function mapViewBookmarkWriteFailedNotice(kind: "save" | "delete"): OperationNotice {
  return error(kind === "save"
    ? "表示ブックマークを保存できませんでした。"
    : "表示ブックマークを削除できませんでした。");
}

export type MapViewBookmarkFailureReason =
  | "unavailable"
  | "read"
  | "invalid"
  | "write"
  | "empty-name"
  | "duplicate-name";

/** ストレージ失敗理由から通知文言への純粋な対応付け。 */
export function mapViewBookmarkFailureNotice(
  reason: MapViewBookmarkFailureReason,
  changeKind: "save" | "delete",
): OperationNotice {
  if (reason === "empty-name") return mapViewBookmarkEmptyNameNotice();
  if (reason === "duplicate-name") return mapViewBookmarkDuplicateNameNotice();
  if (reason === "write") return mapViewBookmarkWriteFailedNotice(changeKind);
  return mapViewBookmarkReadFailedNotice();
}
