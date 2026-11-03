import { useCallback, useLayoutEffect, useMemo, useReducer, useRef } from "react";
import { resolveResolutionLevel } from "@/domain/nodes/nodeResolutionLevel";
import { collectVisibleNodeIds } from "@/domain/nodes/nodeVisibility";
import {
  createResolutionFilterState,
  reduceResolutionFilterState,
  resolveEffectiveFilterScale,
} from "@/hooks/mapResolutionFilterState";
import type { Node } from "@/types/node";
import type { ResolutionFilterMode } from "@/types/nodeResolution";

// 表示のリセットで使う、最新の自動の表示レベルと、リセットを待つ間の倍率
type ResolutionResetState = {
  level: ReturnType<typeof resolveResolutionLevel>;
  pendingScale: number | null;
};

type UseMapResolutionFilterOptions = {
  nodes: readonly Node[];
  scale: number;
  resetRevision: number;
  resetScale?: number;
};

export function useMapResolutionFilter({
  nodes,
  scale,
  resetRevision,
  resetScale,
}: UseMapResolutionFilterOptions) {
  const [{ mode, previousAutoLevel, pendingResetScale }, dispatch] = useReducer(
    reduceResolutionFilterState,
    undefined,
    createResolutionFilterState,
  );
  const effectiveScale = resolveEffectiveFilterScale({
    mode,
    previousAutoLevel,
    pendingResetScale,
  }, scale);
  const level = resolveResolutionLevel(mode, effectiveScale, previousAutoLevel);
  const resetAutoLevel = resolveResolutionLevel("auto", resetScale ?? scale, null);
  const resetStateRef = useRef<ResolutionResetState>({ level: resetAutoLevel, pendingScale: null });
  const visibleNodeIds = useMemo(
    () => collectVisibleNodeIds(nodes, level),
    [level, nodes],
  );

  useLayoutEffect(() => {
    resetStateRef.current = {
      level: resetAutoLevel,
      pendingScale: resetScale !== undefined && scale !== resetScale ? resetScale : null,
    };
  }, [resetAutoLevel, resetScale, scale]);

  useLayoutEffect(() => {
    dispatch({ type: "reset", ...resetStateRef.current });
  }, [resetRevision]);

  useLayoutEffect(() => {
    if (pendingResetScale === null || scale !== pendingResetScale) return;
    dispatch({ type: "completePendingReset" });
  }, [pendingResetScale, scale]);

  useLayoutEffect(() => {
    if (mode === "auto" && pendingResetScale === null) {
      dispatch({ type: "setPreviousAutoLevel", level });
    }
  }, [level, mode, pendingResetScale]);

  const setMode = useCallback((nextMode: ResolutionFilterMode) => {
    dispatch({ type: "setMode", mode: nextMode });
  }, []);

  const resetViewportScale = useCallback((nextScale: number) => {
    dispatch({ type: "resetViewport", level: resolveResolutionLevel("auto", nextScale, null),
      pendingScale: scale !== nextScale ? nextScale : null });
  }, [scale]);

  return { mode, level, visibleNodeIds, setMode, resetViewportScale };
}
