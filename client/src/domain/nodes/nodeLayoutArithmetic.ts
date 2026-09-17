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

export function hasSufficientGap(
  start: number,
  end: number,
  requiredGap: number,
): boolean {
  const actualGap = checkedSubtract(end, start);
  if (actualGap === null || actualGap < 0) return false;
  // Independently rounded boundaries can differ by a few ULPs, but large
  // coordinates must not hide a meaningful shortfall in the required gap.
  const tolerance = calculateRoundingTolerance(start, end, requiredGap * 1e-9);
  return requiredGap - actualGap <= tolerance;
}
