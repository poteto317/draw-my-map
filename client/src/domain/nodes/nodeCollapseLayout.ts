import { layoutNodeForest } from "@/domain/nodes/nodeAutoLayout";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";

type CollapsedLayoutProjection = {
  nodes: readonly Node[];
  layoutFailed: boolean;
};

export function projectCollapsedLayout(
  nodes: readonly Node[],
  mode: NodeLayoutMode,
  collapseVisibleNodeIds: ReadonlySet<number>,
): CollapsedLayoutProjection {
  if (mode === "manual" || collapseVisibleNodeIds.size === nodes.length) {
    return { nodes, layoutFailed: false };
  }

  const visibleNodes = nodes.filter((node) => collapseVisibleNodeIds.has(node.id));
  const projectedVisibleNodes = layoutNodeForest(visibleNodes);
  if (projectedVisibleNodes === null) {
    return { nodes, layoutFailed: true };
  }

  const projectedById = new Map(projectedVisibleNodes.map((node) => [node.id, node]));
  return {
    nodes: nodes.map((node) => projectedById.get(node.id) ?? node),
    layoutFailed: false,
  };
}
