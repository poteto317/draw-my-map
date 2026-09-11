import { toLocalPoint, type Point } from "@/components/map/mapGeometry";

const WHEEL_ZOOM_SENSITIVITY = 0.001;

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

export function normalizeWheelDeltaY(
  deltaY: number,
  deltaMode: number,
  pageHeight: number,
): number {
  if (deltaMode === WheelEvent.DOM_DELTA_LINE) return deltaY * 16;
  if (deltaMode === WheelEvent.DOM_DELTA_PAGE) return deltaY * pageHeight;
  return deltaY;
}

export function calculateWheelZoomRequest(
  input: WheelZoomInput,
  currentScale: number,
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
  ];
  if (values.some((value) => !Number.isFinite(value)) || currentScale <= 0) return null;

  const delta = normalizeWheelDeltaY(input.deltaY, input.deltaMode, input.pageHeight);
  const requestedScale = currentScale * Math.exp(-delta * WHEEL_ZOOM_SENSITIVITY);
  if (!Number.isFinite(delta) || !Number.isFinite(requestedScale)) return null;

  return {
    anchor: toLocalPoint(
      input.clientX,
      input.clientY,
      { left: input.bounds.left, top: input.bounds.top },
    ),
    requestedScale,
  };
}
