import {
  calculateMidpoint,
  calculatePinchViewport,
  hasFinitePositiveDistance,
} from "@/components/map/pixi/pinchViewport";
import { INITIAL_VIEWPORT } from "@/components/map/mapViewport";

describe("hasFinitePositiveDistance", () => {
  it("有限で異なる2点だけを受け入れる", () => {
    expect(hasFinitePositiveDistance({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(true);
    expect(hasFinitePositiveDistance({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(false);
    expect(hasFinitePositiveDistance({ x: 0, y: 0 }, { x: Number.NaN, y: 1 })).toBe(false);
    expect(hasFinitePositiveDistance({ x: 0, y: 0 }, { x: 1, y: Number.POSITIVE_INFINITY }))
      .toBe(false);
    expect(hasFinitePositiveDistance(
      { x: -Number.MAX_VALUE, y: 0 },
      { x: Number.MAX_VALUE, y: 0 },
    )).toBe(false);
  });
});

describe("calculateMidpoint", () => {
  it("同符号の大きな有限座標でも加算overflowせず中点を返す", () => {
    expect(calculateMidpoint(
      { x: 1e308, y: 1e308 },
      { x: 1.2e308, y: 1.2e308 },
    )).toEqual({ x: 1.1e308, y: 1.1e308 });
  });
});

describe("calculatePinchViewport", () => {
  it("座標と倍率が変わらない場合は同じviewport参照を返す", () => {
    const viewport = { offsetX: 10, offsetY: 20, scale: 2 };

    expect(calculatePinchViewport(
      viewport,
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    )).toBe(viewport);
  });

  it("距離比で拡大し開始中点のワールド座標を現在中点へ移す", () => {
    expect(calculatePinchViewport(
      INITIAL_VIEWPORT,
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 10, y: 10 },
      { x: 210, y: 10 },
    )).toEqual({ offsetX: 10, offsetY: 10, scale: 2 });
  });

  it.each([
    [{ x: 0, y: 0 }, { x: 1000, y: 0 }, 4],
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, 0.25],
    [{ x: 50, y: 0 }, { x: 50, y: 0 }, 0.25],
  ])("倍率をviewportの範囲へ制限する", (currentFirst, currentSecond, scale) => {
    expect(calculatePinchViewport(
      INITIAL_VIEWPORT,
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      currentFirst,
      currentSecond,
    )?.scale).toBe(scale);
  });

  it("開始距離がゼロなら計算しない", () => {
    expect(calculatePinchViewport(
      INITIAL_VIEWPORT,
      { x: 10, y: 10 },
      { x: 10, y: 10 },
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    )).toBeNull();
  });

  it("非有限の点では計算しない", () => {
    expect(calculatePinchViewport(
      INITIAL_VIEWPORT,
      { x: Number.NaN, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    )).toBeNull();
  });

  it("有限な大座標でもpinch結果を更新する", () => {
    const result = calculatePinchViewport(
      INITIAL_VIEWPORT,
      { x: 1e308, y: 0 },
      { x: 1.1e308, y: 0 },
      { x: 1e308, y: 0 },
      { x: 1.2e308, y: 0 },
    );

    expect(result?.scale).toBeCloseTo(2);
    expect(Number.isFinite(result?.offsetX)).toBe(true);
    expect(Number.isFinite(result?.offsetY)).toBe(true);
  });

  it("倍率との乗算前に距離比を求めてoverflowを避ける", () => {
    const result = calculatePinchViewport(
      { offsetX: 0, offsetY: 0, scale: 2 },
      { x: 0, y: 0 },
      { x: 1.333e308, y: 0 },
      { x: 0, y: 0 },
      { x: 1e308, y: 0 },
    );

    expect(result?.scale).toBeCloseTo(2 * (1e308 / 1.333e308));
  });

  it("中点差がoverflowする場合はviewportを返さない", () => {
    expect(calculatePinchViewport(
      INITIAL_VIEWPORT,
      { x: -1.15e308, y: 0 },
      { x: -1.05e308, y: 0 },
      { x: 1.05e308, y: 0 },
      { x: 1.15e308, y: 0 },
    )).toBeNull();
  });
});
