import { formatMapFileTimestamp } from "@/domain/mapLibrary/mapFileName";
import {
  MAX_LIBRARY_BACKUP_BYTES,
  parseLibraryBackupJson,
  type LibraryBackupV1,
} from "@/domain/mapLibrary/libraryBackupCodec";
import type { MapDocumentResult } from "@/types/mapDocument";

export async function readLibraryBackupFile(file: File): Promise<MapDocumentResult<LibraryBackupV1>> {
  if (file.size > MAX_LIBRARY_BACKUP_BYTES) {
    return {
      ok: false,
      error: "バックアップは32 MiB以下にしてください。大きいマップは個別のJSON書き出しで保存できます。",
    };
  }
  try {
    return parseLibraryBackupJson(await file.text());
  } catch {
    return { ok: false, error: "バックアップファイルを読み取れませんでした。" };
  }
}

export function downloadLibraryBackup(json: string, now: Date): void {
  const blob = new Blob([json], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `draw-my-map-library-backup-${formatMapFileTimestamp(now)}.json`;
    anchor.click();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
