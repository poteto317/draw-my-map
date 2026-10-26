export function checkedAdd(left: number, right: number): number | null {
  const result = left + right;
  if (!Number.isFinite(result)) return null;
  if (right > 0 && result <= left) return null;
  if (right < 0 && result >= left) return null;
  return result;
}

export function checkedSubtract(left: number, right: number): number | null {
  const result = left - right;
  if (!Number.isFinite(result)) return null;
  if (right > 0 && result >= left) return null;
  if (right < 0 && result <= left) return null;
  return result;
}

export function checkedMultiply(left: number, right: number): number | null {
  const result = left * right;
  return Number.isFinite(result) ? result : null;
}

export function calculateRoundingTolerance(
  first: number,
  second: number,
  absoluteLimit: number,
): number {
  return Math.min(
    absoluteLimit,
    Number.EPSILON * Math.max(1, Math.abs(first), Math.abs(second)) * 4,
  );
}

// 間隔の判定に使う丸めの許容誤差。上限は間隔の 1e-9 倍にし、大きな座標で意味のある不足を隠さない
const GAP_ROUNDING_LIMIT_RATIO = 1e-9;

export function calculateGapRoundingTolerance(
  first: number,
  second: number,
  gap: number,
): number {
  return calculateRoundingTolerance(first, second, gap * GAP_ROUNDING_LIMIT_RATIO);
}

export function hasSufficientGap(
  start: number,
  end: number,
  requiredGap: number,
): boolean {
  const actualGap = checkedSubtract(end, start);
  if (actualGap === null || actualGap < 0) return false;
  // Independently rounded boundaries can differ by a few ULPs, but large
  // coordinates must not hide a meaningful shortfall in the required gap.
  const tolerance = calculateGapRoundingTolerance(start, end, requiredGap);
  return requiredGap - actualGap <= tolerance;
}
