import type { LibraryBackupPreview } from "@/services/persistence/libraryBackupExport";
import type { LibraryRestorePreview } from "@/hooks/mapLibraryState";

export type MapLibraryDialogScreen =
  | { kind: "closed" }
  | { kind: "list" }
  | { kind: "create"; origin: "list" | "header" }
  | { kind: "rename"; mapId: string }
  | { kind: "delete"; mapId: string; allowPermanentDelete?: boolean }
  | { kind: "trash" }
  | { kind: "trashPermanentDelete"; trashId: string }
  | { kind: "trashEmptyConfirm" }
  | { kind: "backupConfirm"; preview: LibraryBackupPreview }
  | { kind: "restoreReading" }
  | { kind: "restoreConfirm"; preview: LibraryRestorePreview };

export type OpenMapLibraryDialogScreen = Exclude<
  MapLibraryDialogScreen,
  { kind: "closed" }
>;

export type MapLibraryRowAction = "open" | "rename" | "delete";

export type MapLibraryTrashRowAction = "restore" | "permanentDelete";

export type MapLibraryDialogFocusTarget =
  | { kind: "screenDefault" }
  | { kind: "listCreateButton" }
  | { kind: "trashButton" }
  | { kind: "emptyTrashButton" }
  | { kind: "backToListButton" }
  | { kind: "backupButton" }
  | { kind: "restoreButton" }
  | { kind: "row"; mapId: string; action: MapLibraryRowAction }
  | { kind: "trashRow"; trashId: string; action: MapLibraryTrashRowAction };

// 空文字は表示なし。sequence は通知を出し直すたびに進め、同じ文言でも読み上げ直させる
export type MapLibraryDialogNotices = { status: string; alert: string; sequence: number };
