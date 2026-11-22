import {
  computeSnapGridLineRange,
} from "@/components/map/pixi/renderSnapGrid";

describe("renderSnapGrid", () => {
  it("ビューポート範囲に合わせてグリッド線の範囲を計算する", () => {
    const range = computeSnapGridLineRange(
      { x: -10, y: 5, width: 100, height: 80 },
      8,
    );
    expect(range).toEqual({
      startX: -16,
      endX: 96,
      startY: 0,
      endY: 88,
    });
  });

  it("不正な矩形は null", () => {
    expect(computeSnapGridLineRange(
      { x: Number.NaN, y: 0, width: 100, height: 100 },
      8,
    )).toBeNull();
  });
});