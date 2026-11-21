import { normalizeWheelDelta } from "@/components/map/wheelZoom";

export type WheelPanRequest = {
  dx: number;
  dy: number;
};

type WheelPanInput = {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  pageHeight: number;
};

export function calculateWheelPanRequest(
  input: WheelPanInput,
): WheelPanRequest | null {
  const values = [input.deltaX, input.deltaY, input.deltaMode, input.pageHeight];
  if (values.some((value) => !Number.isFinite(value))) return null;

  const normX = normalizeWheelDelta(input.deltaX, input.deltaMode, input.pageHeight);
  const normY = normalizeWheelDelta(input.deltaY, input.deltaMode, input.pageHeight);
  // 反転で生じる -0 を 0 に潰し、dx/dy がともに 0 と誤判定されないようにする
  const dx = -normX === 0 ? 0 : -normX;
  const dy = -normY === 0 ? 0 : -normY;

  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  if (dx === 0 && dy === 0) return null;

  return { dx, dy };
}