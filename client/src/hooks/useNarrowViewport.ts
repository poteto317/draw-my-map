"use client";

import { useCallback, useEffect, useState } from "react";
import type { EditorViewMode } from "@/domain/view/editorViewMode";
import { narrowViewportMediaQuery } from "@/domain/view/narrowViewport";

function readInitialNarrowViewport(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(narrowViewportMediaQuery()).matches;
}

export type UseNarrowViewportOptions = {
  readonly mapId: string;
  readonly storageMode: "persistent" | "protected";
  readonly viewMode: EditorViewMode;
  readonly applyViewMode: (mode: EditorViewMode) => void;
};

export type UseNarrowViewportResult = {
  readonly isNarrowViewport: boolean;
  readonly userChoseMapOnNarrow: boolean;
  readonly recordManualViewModeChange: (nextMode: EditorViewMode) => void;
};

export function useNarrowViewport({
  mapId,
  storageMode,
  viewMode,
  applyViewMode,
}: UseNarrowViewportOptions): UseNarrowViewportResult {
  const [isNarrowViewport, setIsNarrowViewport] = useState(readInitialNarrowViewport);
  const [userChoseMapOnNarrow, setUserChoseMapOnNarrow] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- mapId / storageMode 変更時のフラグリセットと matchMedia 初回同期 */
  useEffect(() => {
    setUserChoseMapOnNarrow(false);
  }, [mapId, storageMode]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia(narrowViewportMediaQuery());
    const listener = (event: MediaQueryListEvent) => {
      setIsNarrowViewport(event.matches);
    };
    setIsNarrowViewport(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!isNarrowViewport || userChoseMapOnNarrow || viewMode !== "map") return;
    applyViewMode("outline");
  }, [applyViewMode, isNarrowViewport, userChoseMapOnNarrow, viewMode]);

  const recordManualViewModeChange = useCallback((nextMode: EditorViewMode) => {
    if (isNarrowViewport && nextMode === "map") {
      setUserChoseMapOnNarrow(true);
    }
  }, [isNarrowViewport]);

  return {
    isNarrowViewport,
    userChoseMapOnNarrow,
    recordManualViewModeChange,
  };
}