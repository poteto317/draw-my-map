"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_LAYOUT_SNAP_PREFS,
  mergeLayoutSnapPrefs,
  type LayoutSnapPrefs,
} from "@/domain/nodes/snapGrid";
import type { MapLibraryStorage } from "@/services/persistence/mapLibraryStorage";
import {
  LAYOUT_SNAP_STORAGE_KEY,
  readSnapPrefs,
  resolveLayoutSnapStorage,
  writeSnapPrefs,
} from "@/services/layoutSnapStorage";

export type UseLayoutSnapPrefsResult = {
  readonly prefs: LayoutSnapPrefs;
  readonly setEnabled: (enabled: boolean) => void;
  readonly setShowGrid: (showGrid: boolean) => void;
  readonly setGridStep: (gridStep: number) => void;
  readonly refresh: () => void;
};

export function useLayoutSnapPrefs(
  storage: MapLibraryStorage = resolveLayoutSnapStorage(),
): UseLayoutSnapPrefsResult {
  const initial = readSnapPrefs(storage);
  const [prefs, setPrefs] = useState<LayoutSnapPrefs>(
    initial.status === "ok" ? initial.prefs : DEFAULT_LAYOUT_SNAP_PREFS,
  );
  const prefsRef = useRef(prefs);

  const syncFromStorage = useCallback(() => {
    const latest = readSnapPrefs(storage);
    if (latest.status !== "ok") return;
    if (
      latest.prefs.enabled === prefsRef.current.enabled
      && latest.prefs.showGrid === prefsRef.current.showGrid
      && latest.prefs.gridStep === prefsRef.current.gridStep
    ) {
      return;
    }
    prefsRef.current = latest.prefs;
    setPrefs(latest.prefs);
  }, [storage]);

  /* eslint-disable react-hooks/set-state-in-effect -- 同期ストレージ読込 */
  useEffect(() => {
    syncFromStorage();
  }, [syncFromStorage]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== LAYOUT_SNAP_STORAGE_KEY) return;
      syncFromStorage();
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [syncFromStorage]);

  const mergeField = useCallback(
    (partial: Partial<LayoutSnapPrefs>) => {
      const next = mergeLayoutSnapPrefs(prefsRef.current, partial);
      prefsRef.current = next;
      setPrefs(next);
      writeSnapPrefs(storage, partial);
    },
    [storage],
  );

  const setEnabled = useCallback(
    (enabled: boolean) => mergeField({ enabled }),
    [mergeField],
  );
  const setShowGrid = useCallback(
    (showGrid: boolean) => mergeField({ showGrid }),
    [mergeField],
  );
  const setGridStep = useCallback(
    (gridStep: number) => mergeField({ gridStep }),
    [mergeField],
  );

  return useMemo(
    () => ({
      prefs,
      setEnabled,
      setShowGrid,
      setGridStep,
      refresh: syncFromStorage,
    }),
    [prefs, setEnabled, setShowGrid, setGridStep, syncFromStorage],
  );
}