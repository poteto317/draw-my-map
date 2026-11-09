import type { LibraryBackupPreview } from "@/services/persistence/libraryBackupExport";
import type { LibraryRestorePreview } from "@/hooks/mapLibraryState";

export type MapLibraryDialogScreen =
  | { kind: "closed" }
  | { kind: "list" }
  | { kind: "create"; origin: "list" | "header" }
  | { kind: "rename"; mapId: string }
  | { kind: "delete"; mapId: string }
  | { kind: "backupConfirm"; preview: LibraryBackupPreview }
  | { kind: "restoreReading" }
  | { kind: "restoreConfirm"; preview: LibraryRestorePreview };

export type OpenMapLibraryDialogScreen = Exclude<
  MapLibraryDialogScreen,
  { kind: "closed" }
>;

export type MapLibraryRowAction = "open" | "rename" | "delete";

export type MapLibraryDialogFocusTarget =
  | { kind: "screenDefault" }
  | { kind: "listCreateButton" }
  | { kind: "backupButton" }
  | { kind: "restoreButton" }
  | { kind: "row"; mapId: string; action: MapLibraryRowAction };

// 空文字は表示なし。sequence は通知を出し直すたびに進め、同じ文言でも読み上げ直させる
export type MapLibraryDialogNotices = { status: string; alert: string; sequence: number };
