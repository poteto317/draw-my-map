"use client";

import { useCallback, useRef, useState } from "react";
import { isPendingNavigationStale } from "@/hooks/pendingMapNavigationState";
import type {
  MapLibraryOperationResult,
  MapLibraryView,
} from "@/hooks/useMapLibrary";
import type { OperationNotice } from "@/types/operationNotice";
import type { PendingMapNodeNavigation } from "@/types/pendingMapNavigation";

type UsePendingMapNavigationParams = {
  view: MapLibraryView;
  switchMap: (mapId: string) => MapLibraryOperationResult;
  publishShellNotice: (notice: OperationNotice) => void;
};

export type UsePendingMapNavigationResult = {
  pendingNavigation: PendingMapNodeNavigation | null;
  consumePendingNavigation: (token: number) => void;
  clearPendingNavigation: () => void;
  switchToMapTarget: (targetMapId: string, targetNodeId?: number) => void;
};

// シェル側で他マップ特定ノードへの遷移要求を管理するフック。
// マップ切替・削除・保護モード移行などでセッションが一致しなくなったら自動破棄する（L-037）
export function usePendingMapNavigation({
  view,
  switchMap,
  publishShellNotice,
}: UsePendingMapNavigationParams): UsePendingMapNavigationResult {
  const [pendingNavigation, setPendingNavigation] =
    useState<PendingMapNodeNavigation | null>(null);
  const navigationTokenRef = useRef(0);

  const isStale = isPendingNavigationStale(pendingNavigation, view);
  if (isStale) {
    setPendingNavigation(null);
  }
  const effectivePendingNavigation = isStale ? null : pendingNavigation;

  const consumePendingNavigation = useCallback((token: number) => {
    setPendingNavigation((current) => (current?.token === token ? null : current));
  }, []);

  const clearPendingNavigation = useCallback(() => {
    setPendingNavigation(null);
  }, []);

  const switchToMapTarget = useCallback(
    (targetMapId: string, targetNodeId?: number) => {
      if (view.status !== "ready" || view.storageMode === "protected") {
        setPendingNavigation(null);
        publishShellNotice({
          kind: "error",
          message: "保護モードのため他のマップへ移動できません。",
        });
        return;
      }
      const result = switchMap(targetMapId);
      if (!result.ok) {
        setPendingNavigation(null);
        publishShellNotice(result.notice);
        return;
      }
      if (result.notice !== null) {
        publishShellNotice(result.notice);
      }
      if (targetNodeId !== undefined && result.sessionNumber !== undefined) {
        navigationTokenRef.current += 1;
        setPendingNavigation({
          mapId: targetMapId,
          sessionNumber: result.sessionNumber,
          nodeId: targetNodeId,
          token: navigationTokenRef.current,
        });
      } else {
        setPendingNavigation(null);
      }
    },
    [publishShellNotice, switchMap, view],
  );

  return {
    pendingNavigation: effectivePendingNavigation,
    consumePendingNavigation,
    clearPendingNavigation,
    switchToMapTarget,
  };
}
