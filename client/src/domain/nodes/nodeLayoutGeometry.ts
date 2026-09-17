import type { IndexedNodeForest } from "@/domain/nodes/nodeLayoutForest";
import { calculateNodeLayoutMetrics } from "@/domain/nodes/nodeLayoutMetrics";
import { placeNodeForest, type LayoutPoint } from "@/domain/nodes/nodeLayoutPlacement";
import { hasValidVerticalSpacing } from "@/domain/nodes/nodeLayoutSpacing";

export type { LayoutPoint } from "@/domain/nodes/nodeLayoutPlacement";

export function calculateNodePositions(
  forest: IndexedNodeForest,
): ReadonlyMap<number, LayoutPoint> | null {
  if (forest.nodes.length === 0) return new Map();
  const metrics = calculateNodeLayoutMetrics(forest);
  if (!metrics) return null;
  const positions = placeNodeForest(forest, metrics);
  if (!positions || !hasValidVerticalSpacing(forest, positions)) return null;
  return positions;
}
