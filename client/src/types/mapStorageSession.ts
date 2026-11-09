import type { MapDocumentResult } from "@/types/mapDocument";
import type { MapRestoreOrigin } from "@/domain/persistence/mapSaveStatus";

export type MapBodyWriteResult =
  | { status: "saved" }
  | { status: "failed"; error: string }
  | { status: "inactive" };

export type MapFlushResult =
  | { status: "saved" }
  | { status: "unchanged" }
  | { status: "failed"; error: string };

export type MapBackupSnapshot = {
  json: string;
  hydrated: boolean;
  restoreOrigin: MapRestoreOrigin | null;
  hasSavedBodyThisMount: boolean;
};

export type MapStorageSession = {
  mapId: string;
  readBody: () => MapDocumentResult<string | null>;
  writeBody: (json: string) => MapBodyWriteResult;
  registerFlush: (flush: () => MapFlushResult) => () => void;
  registerBackupSnapshot: (snapshot: () => MapBackupSnapshot) => () => void;
  readBackupSnapshot: () => MapBackupSnapshot | null;
};
