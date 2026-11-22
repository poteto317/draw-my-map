import { calculateNodePositions } from "@/domain/nodes/nodeLayoutGeometry";
import {
  mapLayoutPointFromTreeDirection,
  mapNodesForTreeDirection,
} from "@/domain/nodes/nodeLayoutDirection";
import { indexNodeForest } from "@/domain/nodes/nodeLayoutForest";
import { DEFAULT_LAYOUT_SPACING } from "@/domain/persistence/mapDocumentLayoutSpacing";
import type { LayoutSpacing } from "@/types/layoutSpacing";
import type { Node } from "@/types/node";
import type { TreeDirection } from "@/types/treeDirection";

export type LayoutNodeForestOptions = {
  direction: TreeDirection;
  spacing: LayoutSpacing;
};

export const DEFAULT_LAYOUT_NODE_FOREST_OPTIONS: LayoutNodeForestOptions = {
  direction: "lr",
  spacing: DEFAULT_LAYOUT_SPACING,
};

export function layoutNodeForest(
  nodes: readonly Node[],
  options: LayoutNodeForestOptions = DEFAULT_LAYOUT_NODE_FOREST_OPTIONS,
): Node[] | null {
  const { direction, spacing } = options;
  const layoutNodes = mapNodesForTreeDirection(nodes, direction);
  const forest = indexNodeForest(layoutNodes);
  if (!forest) return null;
  const positions = calculateNodePositions(forest, spacing);
  if (!positions) return null;
  return nodes.map((node) => {
    const point = mapLayoutPointFromTreeDirection(positions.get(node.id)!, direction);
    return point.x === node.x && point.y === node.y
      ? node
      : { ...node, x: point.x, y: point.y };
  });
}