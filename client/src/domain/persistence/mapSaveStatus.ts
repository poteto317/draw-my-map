import type { ConflictState } from "@/domain/mapLibrary/mapConflict";

export type MapRestoreOrigin = "restored" | "empty" | "failed";

export type MapSaveStatus =
  | "checking"
  | "saved"
  | "beforeSave"
  | "restoreFailed"
  | "pending"
  | "failed"
  | "protected"
  | "conflict"
  | "externallyDeleted";

type MapSaveStatusInput = {
  hydrated: boolean;
  restoreOrigin: MapRestoreOrigin | null;
  currentSnapshot: string;
  initialPersistedSnapshot: string | null;
  confirmedSnapshot: string | null;
  forcedSnapshot: string | null;
  hasSaveFailure: boolean;
  storageMode: "persistent" | "protected";
  conflictState?: ConflictState;
};

export function deriveMapSaveStatus({
  hydrated,
  restoreOrigin,
  currentSnapshot,
  initialPersistedSnapshot,
  confirmedSnapshot,
  forcedSnapshot,
  hasSaveFailure,
  storageMode,
  conflictState,
}: MapSaveStatusInput): MapSaveStatus {
  if (conflictState === "conflict") return "conflict";
  if (conflictState === "externallyDeleted") return "externallyDeleted";
  if (storageMode === "protected") return "protected";
  if (!hydrated || restoreOrigin === null) return "checking";

  if (forcedSnapshot === null && currentSnapshot === confirmedSnapshot) {
    return "saved";
  }
  if (hasSaveFailure) return "failed";

  if (forcedSnapshot === null && currentSnapshot === initialPersistedSnapshot) {
    if (restoreOrigin === "empty") return "beforeSave";
    if (restoreOrigin === "failed") return "restoreFailed";
  }

  return "pending";
}
