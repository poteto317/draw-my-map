import type {
  ResolutionFilterMode,
  ResolutionLevel,
} from "@/types/nodeResolution";

export type ResolutionFilterState = {
  mode: ResolutionFilterMode;
  previousAutoLevel: ResolutionLevel | null;
  pendingResetScale: number | null;
};

export type ResolutionFilterAction =
  | { type: "setMode"; mode: ResolutionFilterMode }
  | { type: "setPreviousAutoLevel"; level: ResolutionLevel }
  | { type: "resetViewport"; level: ResolutionLevel; pendingScale: number | null }
  | { type: "reset"; level: ResolutionLevel; pendingScale: number | null }
  | { type: "completePendingReset" };

export function createResolutionFilterState(): ResolutionFilterState {
  return {
    mode: "auto",
    previousAutoLevel: null,
    pendingResetScale: null,
  };
}

export function reduceResolutionFilterState(
  state: ResolutionFilterState,
  action: ResolutionFilterAction,
): ResolutionFilterState {
  if (action.type === "setMode") {
    if (action.mode === "auto" && state.mode !== "auto") {
      return createResolutionFilterState();
    }

    return state.mode === action.mode && state.pendingResetScale === null
      ? state
      : { ...state, mode: action.mode, pendingResetScale: null };
  }

  if (action.type === "setPreviousAutoLevel") {
    return state.pendingResetScale !== null || state.previousAutoLevel === action.level
      ? state
      : { ...state, previousAutoLevel: action.level };
  }

  if (action.type === "completePendingReset") {
    return state.pendingResetScale === null
      ? state
      : { ...state, pendingResetScale: null };
  }

  const nextMode = action.type === "resetViewport" ? state.mode : "auto";
  return state.mode === nextMode
    && state.previousAutoLevel === action.level
    && state.pendingResetScale === action.pendingScale
    ? state
    : {
      mode: nextMode,
      previousAutoLevel: action.level,
      pendingResetScale: action.pendingScale,
    };
}

export function resolveEffectiveFilterScale(
  state: ResolutionFilterState,
  scale: number,
): number {
  return state.pendingResetScale ?? scale;
}
