import { useMemo } from "react";

import { collectDisplayVisibleNodeIds } from "@/domain/nodes/mapDisplayVisibility";
import { projectCollapsedLayout } from "@/domain/nodes/nodeCollapseLayout";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";

type UseMapDisplayStateOptions = {
  nodes: readonly Node[];
  layoutMode: NodeLayoutMode;
  collapseVisibleNodeIds: ReadonlySet<number>;
  resolutionVisibleNodeIds: ReadonlySet<number>;
  focusVisibleNodeIds?: ReadonlySet<number> | null;
  focusRootId?: number | null;
};

type MapDisplayState = {
  displayNodes: readonly Node[];
  visibleNodeIds: ReadonlySet<number>;
  fitNodes: readonly Node[];
  layoutFailed: boolean;
};

export function useMapDisplayState({
  nodes,
  layoutMode,
  collapseVisibleNodeIds,
  resolutionVisibleNodeIds,
  focusVisibleNodeIds,
  focusRootId,
}: UseMapDisplayStateOptions): MapDisplayState {
  const projection = useMemo(
    () => projectCollapsedLayout(nodes, layoutMode, collapseVisibleNodeIds),
    [collapseVisibleNodeIds, layoutMode, nodes],
  );
  const fitNodes = useMemo(() => projection.nodes.filter(({ id }) =>
    collapseVisibleNodeIds.has(id) && (focusVisibleNodeIds?.has(id) ?? true),
  ), [collapseVisibleNodeIds, focusVisibleNodeIds, projection.nodes]);
  const visibleNodeIds = useMemo(() => collectDisplayVisibleNodeIds(
    projection.nodes.map(({ id }) => id),
    {
      collapseVisibleNodeIds,
      focusVisibleNodeIds,
      resolutionVisibleNodeIds,
      focusRootId,
    },
  ), [
    collapseVisibleNodeIds,
    focusRootId,
    focusVisibleNodeIds,
    projection.nodes,
    resolutionVisibleNodeIds,
  ]);

  return {
    displayNodes: projection.nodes,
    visibleNodeIds,
    fitNodes,
    layoutFailed: projection.layoutFailed,
  };
}
