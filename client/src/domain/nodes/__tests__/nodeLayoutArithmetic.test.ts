import {
  calculateGapRoundingTolerance,
  calculateRoundingTolerance,
  checkedAdd,
  checkedMultiply,
  checkedSubtract,
  hasSufficientGap,
} from "@/domain/nodes/nodeLayoutArithmetic";

describe("checked arithmetic", () => {
  it.each([
    [2, 3, 5], [2, -3, -1], [2, 0, 2],
    [Number.MAX_VALUE, 1, null], [-Number.MAX_VALUE, -1, null],
    [Number.MAX_VALUE, Number.MAX_VALUE, null],
  ])("checkedAdd(%s, %s) returns %s", (left, right, expected) => {
    expect(checkedAdd(left, right)).toBe(expected);
  });

  it.each([
    [2, 3, -1], [2, -3, 5], [2, 0, 2],
    [-Number.MAX_VALUE, 1, null], [Number.MAX_VALUE, -1, null],
    [-Number.MAX_VALUE, Number.MAX_VALUE, null],
  ])("checkedSubtract(%s, %s) returns %s", (left, right, expected) => {
    expect(checkedSubtract(left, right)).toBe(expected);
  });

  it.each([
    [3, 0.5, 1.5], [3, -2, -6], [Number.MAX_VALUE, 0, 0],
    [Number.MAX_VALUE, 2, null], [Number.NaN, 1, null],
  ])("checkedMultiply(%s, %s) returns %s", (left, right, expected) => {
    expect(checkedMultiply(left, right)).toBe(expected);
  });
});

describe("hasSufficientGap", () => {
  it.each([
    ["正確なgap", 60, 100, 40, true],
    ["必要値より大きいgap", -60, 100, 40, true],
    ["数ULPの不足", 60, 99.99999999999999, 40, true],
    ["意味のある不足", 60, 99.999, 40, false],
    ["大座標で絶対上限を超える不足", 1e12, 1e12 + 39.9999, 40, false],
    ["水平gap112", 2 ** 56 + 112, 2 ** 56 + 224, 120, false],
    ["tree gap64", 2 ** 57 + 64, 2 ** 57 + 128, 80, false],
    ["負のgap", 60, 59, 40, false],
    ["差分overflow", -1e308, 1e308, 40, false],
    ["正方向precision saturation", -60, Number.MAX_VALUE, 40, false],
    ["負方向precision saturation", 60, Number.MAX_VALUE, 40, false],
    ["非有限start", Number.NaN, 100, 40, false],
    ["非有限end", 60, Number.POSITIVE_INFINITY, 40, false],
  ])("%sを判定する", (_name, start, end, requiredGap, expected) => {
    expect(hasSufficientGap(start, end, requiredGap)).toBe(expected);
  });
});

describe("calculateRoundingTolerance", () => {
  it("単位未満の座標にも4 ULP相当の最小許容差を持つ", () => {
    expect(calculateRoundingTolerance(0.1, -0.2, 4e-8)).toBe(8.881784197001252e-16);
  });

  it("符号にかかわらず大きい座標に合わせて許容差を求める", () => {
    expect(calculateRoundingTolerance(2, -8, 4e-8)).toBe(7.105427357601002e-15);
  });

  it("大座標でも意味のある不足を許容しないよう上限を守る", () => {
    expect(calculateRoundingTolerance(1e12, 1e12 + 100, 4e-8)).toBe(4e-8);
  });
});

describe("calculateGapRoundingTolerance", () => {
  it("小さな座標では4 ULP相当の許容差を返す", () => {
    expect(calculateGapRoundingTolerance(2, -8, 40)).toBe(calculateRoundingTolerance(2, -8, 4e-8));
  });

  it("大きな座標では間隔の1e-9倍を上限にする", () => {
    expect(calculateGapRoundingTolerance(1e12, 1e12 + 100, 40)).toBe(40 * 1e-9);
    expect(calculateGapRoundingTolerance(1e12, 1e12 + 100, 120)).toBe(120 * 1e-9);
  });
});
