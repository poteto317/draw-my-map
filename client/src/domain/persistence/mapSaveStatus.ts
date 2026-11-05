export type MapRestoreOrigin = "restored" | "empty" | "failed";

export type MapSaveStatus =
  | "checking"
  | "saved"
  | "beforeSave"
  | "restoreFailed"
  | "pending"
  | "failed"
  | "protected";

type MapSaveStatusInput = {
  hydrated: boolean;
  restoreOrigin: MapRestoreOrigin | null;
  currentSnapshot: string;
  initialPersistedSnapshot: string | null;
  confirmedSnapshot: string | null;
  forcedSnapshot: string | null;
  hasSaveFailure: boolean;
  storageMode: "persistent" | "protected";
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
}: MapSaveStatusInput): MapSaveStatus {
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
