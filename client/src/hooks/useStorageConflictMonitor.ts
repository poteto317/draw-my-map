import { useEffect } from "react";
import type { ConflictState } from "@/domain/mapLibrary/mapConflict";
import { classifyStorageChange } from "@/domain/mapLibrary/mapConflict";
import { useLatestRef } from "@/hooks/useLatestRef";
import {
  MAP_INDEX_STORAGE_KEY,
  isMapInStorageIndex,
  mapBodyKey,
  type MapLibraryStorage,
} from "@/services/persistence/mapLibraryStorage";
import { subscribeStorageEvent } from "@/services/persistence/storageEventHub";

export interface UseStorageConflictMonitorOptions {
  mapId: string;
  sessionNumber: number;
  getHasPendingEdits: () => boolean;
  storage: MapLibraryStorage;
  onExternalChange: (kind: Exclude<ConflictState, "none">) => void;
}

export function useStorageConflictMonitor({
  mapId,
  sessionNumber,
  getHasPendingEdits,
  storage,
  onExternalChange,
}: UseStorageConflictMonitorOptions): void {
  const optionsRef = useLatestRef({
    mapId,
    sessionNumber,
    getHasPendingEdits,
    storage,
    onExternalChange,
  });

  useEffect(() => {
    const registeredSessionNumber = sessionNumber;
    return subscribeStorageEvent((event: StorageEvent) => {
      const current = optionsRef.current;
      // ABA 問題防止: リスナー登録時の世代番号と現在の世代番号が一致していることを確認
      if (registeredSessionNumber !== current.sessionNumber) {
        return;
      }

      const isCurrentMapBodyKey = event.key === mapBodyKey(current.mapId);
      const isMapIndexKey = event.key === MAP_INDEX_STORAGE_KEY;

      if (!isCurrentMapBodyKey && !isMapIndexKey) {
        return;
      }

      const isCurrentMapInIndex = isMapInStorageIndex(current.storage, current.mapId);
      const hasPendingEdits = current.getHasPendingEdits();

      const kind = classifyStorageChange({
        isCurrentMapBodyKey,
        isMapIndexKey,
        newValue: event.newValue,
        hasPendingEdits,
        isCurrentMapInIndex,
      });

      if (kind !== "none") {
        current.onExternalChange(kind);
      }
    });
  }, [optionsRef, sessionNumber, mapId, storage]);
}
