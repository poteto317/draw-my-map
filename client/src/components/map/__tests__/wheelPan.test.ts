import { calculateWheelPanRequest } from "@/components/map/wheelPan";

describe("calculateWheelPanRequest", () => {
  it("正規化後の delta を反転した dx/dy を返す", () => {
    expect(calculateWheelPanRequest({
      deltaX: 10,
      deltaY: 20,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      pageHeight: 600,
    })).toEqual({ dx: -10, dy: -20 });
  });

  it.each([
    { deltaX: 5, deltaY: 0, deltaMode: WheelEvent.DOM_DELTA_LINE, pageHeight: 600, expected: { dx: -80, dy: 0 } },
    { deltaX: 0, deltaY: 5, deltaMode: WheelEvent.DOM_DELTA_LINE, pageHeight: 600, expected: { dx: 0, dy: -80 } },
    { deltaX: 5, deltaY: 5, deltaMode: WheelEvent.DOM_DELTA_LINE, pageHeight: 600, expected: { dx: -80, dy: -80 } },
  ])("LINE モードを 16 倍して反転する", ({ deltaX, deltaY, deltaMode, pageHeight, expected }) => {
    expect(calculateWheelPanRequest({ deltaX, deltaY, deltaMode, pageHeight })).toEqual(expected);
  });

  it.each([
    { deltaX: 5, deltaY: 0, deltaMode: WheelEvent.DOM_DELTA_PAGE, pageHeight: 600, expected: { dx: -3000, dy: 0 } },
    { deltaX: 0, deltaY: 5, deltaMode: WheelEvent.DOM_DELTA_PAGE, pageHeight: 600, expected: { dx: 0, dy: -3000 } },
    { deltaX: 5, deltaY: 5, deltaMode: WheelEvent.DOM_DELTA_PAGE, pageHeight: 600, expected: { dx: -3000, dy: -3000 } },
  ])("PAGE モードは縦横とも pageHeight で正規化する", ({ deltaX, deltaY, deltaMode, pageHeight, expected }) => {
    expect(calculateWheelPanRequest({ deltaX, deltaY, deltaMode, pageHeight })).toEqual(expected);
  });

  it("deltaX と deltaY がともに 0 のとき null を返す", () => {
    expect(calculateWheelPanRequest({
      deltaX: 0,
      deltaY: 0,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      pageHeight: 600,
    })).toBeNull();
  });

  it.each([
    [{ deltaX: Number.NaN }, { dx: 0, dy: -10 }],
    [{ deltaY: Number.POSITIVE_INFINITY }, { dx: -10, dy: 0 }],
    [{ deltaMode: Number.NaN }, { dx: -10, dy: -10 }],
    [{ pageHeight: Number.NaN }, { dx: -10, dy: -10 }],
  ])("非有限の入力を拒否する", (override, _rest) => {
    expect(calculateWheelPanRequest({
      deltaX: 10,
      deltaY: 10,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      pageHeight: 600,
      ...override,
    })).toBeNull();
  });

  it("片方だけ 0 でももう一方が非ゼロならパン要求を返す", () => {
    expect(calculateWheelPanRequest({
      deltaX: 0,
      deltaY: -15,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      pageHeight: 600,
    })).toEqual({ dx: 0, dy: 15 });
  });
});