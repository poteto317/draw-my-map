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
  /**
   * false のときイベントを無視（共同編集中は Yjs 正本・L-061）。
   * 購読自体は維持し、イベント時に読む（呼び出し側が後から切り替えてもよい）。
   */
  enabled?: boolean;
  /** 後段導出の上書き。指定時はイベント時にこれを優先する */
  getEnabled?: () => boolean;
}

export function useStorageConflictMonitor({
  mapId,
  sessionNumber,
  getHasPendingEdits,
  storage,
  onExternalChange,
  enabled = true,
  getEnabled,
}: UseStorageConflictMonitorOptions): void {
  const optionsRef = useLatestRef({
    mapId,
    sessionNumber,
    getHasPendingEdits,
    storage,
    onExternalChange,
    enabled,
    getEnabled,
  });

  useEffect(() => {
    const registeredSessionNumber = sessionNumber;
    return subscribeStorageEvent((event: StorageEvent) => {
      const current = optionsRef.current;
      const isEnabled = current.getEnabled?.() ?? current.enabled;
      if (!isEnabled) return;
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
