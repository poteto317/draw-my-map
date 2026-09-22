import { useLayoutEffect } from "react";
import { INITIAL_VIEWPORT, type Viewport } from "@/components/map/mapViewport";

type UseMapStageResetOptions = {
  resetRevision: number;
  cancelEditing: () => void;
  cancelActiveGesture: () => void;
  setViewport: (viewport: Viewport) => void;
};

export function useMapStageReset({
  resetRevision,
  cancelEditing,
  cancelActiveGesture,
  setViewport,
}: UseMapStageResetOptions): void {
  useLayoutEffect(() => {
    cancelEditing();
    cancelActiveGesture();
    setViewport(INITIAL_VIEWPORT);
  }, [
    resetRevision,
    cancelEditing,
    cancelActiveGesture,
    setViewport,
  ]);
}
