import type { LayoutSpacing } from "@/types/layoutSpacing";

export type LayoutGapMetrics = {
  childGap: number;
  siblingGap: number;
};

export function resolveLayoutMetrics(spacing: LayoutSpacing): LayoutGapMetrics {
  return { childGap: spacing.childGap, siblingGap: spacing.siblingGap };
}