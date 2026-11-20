import type { MapViewSnapshot } from "@/types/mapViewSnapshot";

export type MapViewHistoryStacks = {
  back: readonly MapViewSnapshot[];
  forward: readonly MapViewSnapshot[];
};

export const EMPTY_MAP_VIEW_HISTORY: MapViewHistoryStacks = { back: [], forward: [] };

export const MAX_MAP_VIEW_HISTORY = 50;

export function recordMapViewHistory(
  history: MapViewHistoryStacks,
  before: MapViewSnapshot,
  maxEntries = MAX_MAP_VIEW_HISTORY,
): MapViewHistoryStacks {
  return {
    back: [...history.back, before].slice(-maxEntries),
    forward: [],
  };
}

export function travelMapViewHistory(
  history: MapViewHistoryStacks,
  direction: "back" | "forward",
  before: MapViewSnapshot,
): { next: MapViewHistoryStacks; destination: MapViewSnapshot } | null {
  const destination = history[direction].at(-1);
  if (!destination) return null;
  return {
    destination,
    next: direction === "back"
      ? { back: history.back.slice(0, -1), forward: [...history.forward, before] }
      : { back: [...history.back, before], forward: history.forward.slice(0, -1) },
  };
}
