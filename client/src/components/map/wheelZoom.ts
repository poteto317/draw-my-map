import { toLocalPoint, type Point } from "@/components/map/mapGeometry";
import { clampViewportScale } from "@/components/map/mapViewport";

/** 呼び出し側が感度を省略したときの既定。UI設定の既定値と同じ。 */
const DEFAULT_SENSITIVITY = 0.0025;
const WHEEL_DELTA_MODE_LINE = 1;
const WHEEL_DELTA_MODE_PAGE = 2;

export type WheelZoomRequest = {
  anchor: Point;
  requestedScale: number;
};

type WheelZoomInput = {
  clientX: number;
  clientY: number;
  deltaY: number;
  deltaMode: number;
  pageHeight: number;
  bounds: Pick<DOMRect, "left" | "top">;
};

export function normalizeWheelDelta(
  delta: number,
  deltaMode: number,
  pageHeight: number,
): number {
  if (deltaMode === WHEEL_DELTA_MODE_LINE) return delta * 16;
  if (deltaMode === WHEEL_DELTA_MODE_PAGE) return delta * pageHeight;
  return delta;
}

export function normalizeWheelDeltaY(
  deltaY: number,
  deltaMode: number,
  pageHeight: number,
): number {
  return normalizeWheelDelta(deltaY, deltaMode, pageHeight);
}

export function calculateWheelZoomRequest(
  input: WheelZoomInput,
  currentScale: number,
  sensitivity: number = DEFAULT_SENSITIVITY,
): WheelZoomRequest | null {
  const values = [
    input.clientX,
    input.clientY,
    input.deltaY,
    input.deltaMode,
    input.pageHeight,
    input.bounds.left,
    input.bounds.top,
    currentScale,
    sensitivity,
  ];
  if (values.some((value) => !Number.isFinite(value)) || currentScale <= 0 || sensitivity <= 0) {
    return null;
  }

  const delta = normalizeWheelDeltaY(input.deltaY, input.deltaMode, input.pageHeight);
  const requestedScale = currentScale * Math.exp(-delta * sensitivity);
  const anchor = toLocalPoint(
    input.clientX,
    input.clientY,
    { left: input.bounds.left, top: input.bounds.top },
  );
  if (!Number.isFinite(delta)
    || !Number.isFinite(requestedScale)
    || requestedScale <= 0
    || requestedScale === currentScale
    || clampViewportScale(requestedScale) === currentScale
    || !Number.isFinite(anchor.x)
    || !Number.isFinite(anchor.y)) return null;

  return {
    anchor,
    requestedScale,
  };
}
