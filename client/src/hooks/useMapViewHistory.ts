import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  EMPTY_MAP_VIEW_HISTORY,
  recordMapViewHistory,
  travelMapViewHistory,
  type MapViewHistoryStacks,
} from "@/domain/nodes/mapViewHistory";
import type { MapViewSnapshot } from "@/types/mapViewSnapshot";

export function useMapViewHistory(
  mapId: string,
  resetRevision: number,
  captureBeforeNavigation: () => MapViewSnapshot,
  applyView: (snapshot: MapViewSnapshot) => boolean,
) {
  const [stored, setStored] = useState({
    mapId,
    resetRevision,
    history: EMPTY_MAP_VIEW_HISTORY,
  });
  const scopeChanged = stored.mapId !== mapId || stored.resetRevision !== resetRevision;
  const history = scopeChanged ? EMPTY_MAP_VIEW_HISTORY : stored.history;
  if (scopeChanged) setStored({ mapId, resetRevision, history });

  const historyRef = useRef(history);
  useLayoutEffect(() => {
    historyRef.current = EMPTY_MAP_VIEW_HISTORY;
  }, [mapId, resetRevision]);

  const update = useCallback((next: MapViewHistoryStacks) => {
    historyRef.current = next;
    setStored({ mapId, resetRevision, history: next });
  }, [mapId, resetRevision]);

  const recordNavigation = useCallback((before: MapViewSnapshot) => {
    update(recordMapViewHistory(historyRef.current, before));
  }, [update]);

  const travel = useCallback((direction: "back" | "forward") => {
    const current = historyRef.current;
    if (!current[direction].at(-1)) return false;
    const planned = travelMapViewHistory(current, direction, captureBeforeNavigation());
    if (!planned || !applyView(planned.destination)) return false;
    update(planned.next);
    return true;
  }, [applyView, captureBeforeNavigation, update]);

  return {
    canGoBack: history.back.length > 0,
    canGoForward: history.forward.length > 0,
    recordNavigation,
    travel,
  };
}
