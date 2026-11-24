import { calculateNodePositions } from "@/domain/nodes/nodeLayoutGeometry";
import { layoutForestWithBranchLayouts } from "@/domain/nodes/nodeBranchLayoutEngine";
import {
  mapLayoutPointFromTreeDirection,
  mapNodesForTreeDirection,
} from "@/domain/nodes/nodeLayoutDirection";
import { indexNodeForest } from "@/domain/nodes/nodeLayoutForest";
import { calculateRadialPositions } from "@/domain/nodes/nodeRadialLayout";
import { DEFAULT_LAYOUT_SPACING } from "@/domain/persistence/mapDocumentLayoutSpacing";
import type { BranchLayout } from "@/types/branchLayout";
import type { LayoutSpacing } from "@/types/layoutSpacing";
import type { LayoutStyle } from "@/types/layoutStyle";
import type { Node } from "@/types/node";
import type { TreeDirection } from "@/types/treeDirection";

export type LayoutNodeForestOptions = {
  direction: TreeDirection;
  spacing: LayoutSpacing;
  // 欠落＝orthogonal
  layoutStyle?: LayoutStyle;
  // 欠落／radial 中は配置に使わない
  branchLayouts?: readonly BranchLayout[];
};

export const DEFAULT_LAYOUT_NODE_FOREST_OPTIONS: LayoutNodeForestOptions = {
  direction: "lr",
  spacing: DEFAULT_LAYOUT_SPACING,
};

function applyPositions(
  nodes: readonly Node[],
  positions: ReadonlyMap<number, { x: number; y: number }>,
): Node[] {
  return nodes.map((node) => {
    const point = positions.get(node.id)!;
    return point.x === node.x && point.y === node.y
      ? node
      : { ...node, x: point.x, y: point.y };
  });
}

export function layoutNodeForest(
  nodes: readonly Node[],
  options: LayoutNodeForestOptions = DEFAULT_LAYOUT_NODE_FOREST_OPTIONS,
): Node[] | null {
  const { direction, spacing, layoutStyle, branchLayouts } = options;

  if (layoutStyle === "radial") {
    // radial: branchLayouts は使わない。専用幾何へ分岐
    const positions = calculateRadialPositions(nodes, spacing);
    if (!positions) return null;
    return applyPositions(nodes, positions);
  }

  // orthogonal: branchLayouts があれば枝方向エンジン
  const useBranchLayouts = branchLayouts !== undefined && branchLayouts.length > 0;

  if (useBranchLayouts) {
    const forest = indexNodeForest(nodes);
    if (!forest) return null;
    const positions = layoutForestWithBranchLayouts(
      forest,
      spacing,
      direction,
      branchLayouts,
    );
    if (!positions) return null;
    return applyPositions(nodes, positions);
  }

  const layoutNodes = mapNodesForTreeDirection(nodes, direction);
  const forest = indexNodeForest(layoutNodes);
  if (!forest) return null;
  const layoutPositions = calculateNodePositions(forest, spacing);
  if (!layoutPositions) return null;
  const positions = new Map(
    [...layoutPositions].map(([id, point]) => [
      id,
      mapLayoutPointFromTreeDirection(point, direction),
    ]),
  );
  return applyPositions(nodes, positions);
}
