import type { MapBackupSnapshot } from "@/types/mapStorageSession";

export function isEligibleMapBackupSnapshot(snapshot: MapBackupSnapshot | null): snapshot is MapBackupSnapshot {
  return snapshot !== null && snapshot.hydrated && snapshot.restoreOrigin !== null &&
    (snapshot.restoreOrigin !== "failed" || snapshot.hasSavedBodyThisMount);
}
