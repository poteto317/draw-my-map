import { useMemo } from "react";

import { projectCollapsedLayout } from "@/domain/nodes/nodeCollapseLayout";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";

type UseMapDisplayStateOptions = {
  nodes: readonly Node[];
  layoutMode: NodeLayoutMode;
  collapseVisibleNodeIds: ReadonlySet<number>;
  resolutionVisibleNodeIds: ReadonlySet<number>;
};

type MapDisplayState = {
  displayNodes: readonly Node[];
  visibleNodeIds: ReadonlySet<number>;
  layoutFailed: boolean;
};

export function useMapDisplayState({
  nodes,
  layoutMode,
  collapseVisibleNodeIds,
  resolutionVisibleNodeIds,
}: UseMapDisplayStateOptions): MapDisplayState {
  const projection = useMemo(
    () => projectCollapsedLayout(nodes, layoutMode, collapseVisibleNodeIds),
    [collapseVisibleNodeIds, layoutMode, nodes],
  );
  const visibleNodeIds = useMemo(() => {
    const visible = new Set<number>();
    for (const node of nodes) {
      if (collapseVisibleNodeIds.has(node.id) && resolutionVisibleNodeIds.has(node.id)) {
        visible.add(node.id);
      }
    }
    return visible;
  }, [collapseVisibleNodeIds, nodes, resolutionVisibleNodeIds]);

  return {
    displayNodes: projection.nodes,
    visibleNodeIds,
    layoutFailed: projection.layoutFailed,
  };
}
