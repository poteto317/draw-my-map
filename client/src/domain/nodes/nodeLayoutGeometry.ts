import type { IndexedNodeForest } from "@/domain/nodes/nodeLayoutForest";
import { resolveLayoutMetrics } from "@/domain/nodes/resolveLayoutMetrics";
import { calculateNodeLayoutMetrics } from "@/domain/nodes/nodeLayoutMetrics";
import { placeNodeForest, type LayoutPoint } from "@/domain/nodes/nodeLayoutPlacement";
import { hasValidVerticalSpacing } from "@/domain/nodes/nodeLayoutSpacing";
import type { LayoutSpacing } from "@/types/layoutSpacing";

export type { LayoutPoint } from "@/domain/nodes/nodeLayoutPlacement";

export function calculateNodePositions(
  forest: IndexedNodeForest,
  spacing: LayoutSpacing,
): ReadonlyMap<number, LayoutPoint> | null {
  if (forest.nodes.length === 0) return new Map();
  const metrics = resolveLayoutMetrics(spacing);
  const layoutMetrics = calculateNodeLayoutMetrics(forest, metrics);
  if (!layoutMetrics) return null;
  const positions = placeNodeForest(forest, layoutMetrics, metrics);
  if (!positions || !hasValidVerticalSpacing(forest, positions, metrics.siblingGap)) return null;
  return positions;
}