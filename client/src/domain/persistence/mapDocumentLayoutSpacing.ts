import { CHILD_HORIZONTAL_GAP, SIBLING_VERTICAL_GAP } from "@/config/shapes";
import { isRecord } from "@/domain/shared/unknownRecord";
import type { MapDocumentResult, MapDocumentVersion } from "@/types/mapDocument";
import type { LayoutSpacing } from "@/types/layoutSpacing";

export const DEFAULT_LAYOUT_SPACING: LayoutSpacing = {
  childGap: CHILD_HORIZONTAL_GAP,
  siblingGap: SIBLING_VERTICAL_GAP,
};

export const LAYOUT_SPACING_MIN = 8;
export const LAYOUT_SPACING_MAX = 400;

function isPositiveIntegerInRange(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= LAYOUT_SPACING_MIN &&
    value <= LAYOUT_SPACING_MAX
  );
}

export function normalizeMapDocumentLayoutSpacing(
  raw: unknown,
  version: MapDocumentVersion,
): MapDocumentResult<LayoutSpacing | undefined> {
  if (version !== 3) {
    return { ok: true, value: undefined };
  }
  if (raw === undefined) {
    return { ok: true, value: undefined };
  }
  if (!isRecord(raw)) {
    return { ok: false, error: "layoutSpacingはオブジェクトである必要があります。" };
  }
  if (!("childGap" in raw) || !("siblingGap" in raw)) {
    return { ok: false, error: "layoutSpacingはchildGapとsiblingGapの両方を持つ必要があります。" };
  }
  const { childGap, siblingGap } = raw;
  if (!isPositiveIntegerInRange(childGap) || !isPositiveIntegerInRange(siblingGap)) {
    return {
      ok: false,
      error: "layoutSpacingのchildGapとsiblingGapは8以上400以下の正の整数である必要があります。",
    };
  }
  return { ok: true, value: { childGap, siblingGap } };
}

export function projectMapDocumentLayoutSpacing(
  spacing: LayoutSpacing | undefined,
): { layoutSpacing?: LayoutSpacing } {
  if (
    spacing !== undefined &&
    (spacing.childGap !== DEFAULT_LAYOUT_SPACING.childGap
      || spacing.siblingGap !== DEFAULT_LAYOUT_SPACING.siblingGap)
  ) {
    return { layoutSpacing: spacing };
  }
  return {};
}

export function clampLayoutSpacing(spacing: LayoutSpacing): LayoutSpacing {
  return {
    childGap: Math.min(
      LAYOUT_SPACING_MAX,
      Math.max(LAYOUT_SPACING_MIN, Math.round(spacing.childGap)),
    ),
    siblingGap: Math.min(
      LAYOUT_SPACING_MAX,
      Math.max(LAYOUT_SPACING_MIN, Math.round(spacing.siblingGap)),
    ),
  };
}

export function areLayoutSpacingEqual(
  a: LayoutSpacing | undefined,
  b: LayoutSpacing | undefined,
): boolean {
  const left = a ?? DEFAULT_LAYOUT_SPACING;
  const right = b ?? DEFAULT_LAYOUT_SPACING;
  return left.childGap === right.childGap && left.siblingGap === right.siblingGap;
}