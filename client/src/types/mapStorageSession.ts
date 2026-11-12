import type { MapDocumentResult } from "@/types/mapDocument";
import type { MapRestoreOrigin } from "@/domain/persistence/mapSaveStatus";
import type { MapLibraryStorage } from "@/services/persistence/mapLibraryStorage";

export type MapBodyWriteResult =
  | { status: "saved" }
  | { status: "conflict" }
  | { status: "failed"; error: string }
  | { status: "inactive" };

export type MapFlushResult =
  | { status: "saved" }
  | { status: "unchanged" }
  | { status: "conflict" }
  | { status: "failed"; error: string };

export type MapBackupSnapshot = {
  json: string;
  hydrated: boolean;
  restoreOrigin: MapRestoreOrigin | null;
  hasSavedBodyThisMount: boolean;
};

export type MapStorageSession = {
  readonly mapId: string;
  readonly sessionNumber: number;
  readonly storage: MapLibraryStorage;
  readBody: () => MapDocumentResult<string | null>;
  writeBody: (json: string) => MapBodyWriteResult;
  registerFlush: (flush: () => MapFlushResult) => () => void;
  registerBackupSnapshot: (snapshot: () => MapBackupSnapshot) => () => void;
  readBackupSnapshot: () => MapBackupSnapshot | null;
  rebaseSnapshot?: (snapshotJson: string) => void;
};
