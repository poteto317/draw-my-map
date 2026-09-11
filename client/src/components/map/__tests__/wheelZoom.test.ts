import {
  calculateWheelZoomRequest,
  normalizeWheelDeltaY,
} from "@/components/map/wheelZoom";

describe("normalizeWheelDeltaY", () => {
  it.each([
    [5, WheelEvent.DOM_DELTA_PIXEL, 600, 5],
    [5, WheelEvent.DOM_DELTA_LINE, 600, 80],
    [5, WheelEvent.DOM_DELTA_PAGE, 600, 3000],
  ])("delta mode %sをpixel相当へ正規化する", (deltaY, mode, pageHeight, expected) => {
    expect(normalizeWheelDeltaY(deltaY, mode, pageHeight)).toBe(expected);
  });
});

describe("calculateWheelZoomRequest", () => {
  it("canvas相対anchorと指数的な要求倍率を返す", () => {
    expect(calculateWheelZoomRequest({
      clientX: 150,
      clientY: 90,
      deltaY: -100,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      pageHeight: 600,
      bounds: { left: 50, top: 40 },
    }, 2)).toEqual({
      anchor: { x: 100, y: 50 },
      requestedScale: 2 * Math.exp(0.1),
    });
  });

  it("実効倍率が変わらない入力を拒否する", () => {
    expect(calculateWheelZoomRequest({
      clientX: 150,
      clientY: 90,
      deltaY: 0,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      pageHeight: 600,
      bounds: { left: 50, top: 40 },
    }, 2)).toBeNull();
  });

  it.each([
    [4, -1],
    [0.25, 1],
  ])("倍率制限後に現在倍率と同じになる入力を拒否する", (scale, deltaY) => {
    expect(calculateWheelZoomRequest({
      clientX: 150,
      clientY: 90,
      deltaY,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      pageHeight: 600,
      bounds: { left: 50, top: 40 },
    }, scale)).toBeNull();
  });

  it.each([
    [{ clientX: Number.NaN }, 1],
    [{ clientY: Number.POSITIVE_INFINITY }, 1],
    [{ deltaY: Number.NaN }, 1],
    [{ pageHeight: Number.NaN }, 1],
    [{ bounds: { left: Number.NaN, top: 0 } }, 1],
    [{}, 0],
  ])("非有限の入力または非正倍率を拒否する", (override, scale) => {
    expect(calculateWheelZoomRequest({
      clientX: 150,
      clientY: 90,
      deltaY: -100,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      pageHeight: 600,
      bounds: { left: 50, top: 40 },
      ...override,
    }, scale)).toBeNull();
  });

  it("倍率計算がゼロへunderflowする入力を拒否する", () => {
    expect(calculateWheelZoomRequest({
      clientX: 150,
      clientY: 90,
      deltaY: Number.MAX_VALUE,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      pageHeight: 600,
      bounds: { left: 50, top: 40 },
    }, 1)).toBeNull();
  });

  it("有限値同士の差がoverflowするanchorを拒否する", () => {
    expect(calculateWheelZoomRequest({
      clientX: Number.MAX_VALUE,
      clientY: 90,
      deltaY: -100,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      pageHeight: 600,
      bounds: { left: -Number.MAX_VALUE, top: 40 },
    }, 1)).toBeNull();
  });
});
