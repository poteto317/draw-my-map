import {
  LAYOUT_SPACING_MAX,
  LAYOUT_SPACING_MIN,
  clampLayoutSpacing,
} from "@/domain/persistence/mapDocumentLayoutSpacing";

export { clampLayoutSpacing };

export function clampLayoutSpacingValue(value: number): number {
  const rounded = Math.round(value);
  return Math.min(LAYOUT_SPACING_MAX, Math.max(LAYOUT_SPACING_MIN, rounded));
}