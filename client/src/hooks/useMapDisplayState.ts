import { useMemo } from "react";

import { collectDisplayVisibleNodeIds } from "@/domain/nodes/mapDisplayVisibility";
import type { LayoutNodeForestOptions } from "@/domain/nodes/nodeAutoLayout";
import { projectCollapsedLayout } from "@/domain/nodes/nodeCollapseLayout";
import { resolveLayoutNodeForestOptions } from "@/domain/nodes/resolveLayoutSpacing";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import type { NodeMapState } from "@/types/nodeMapState";

type UseMapDisplayStateOptions = {
  nodes: readonly Node[];
  layoutMode: NodeLayoutMode;
  treeDirection?: NodeMapState["treeDirection"];
  layoutSpacing?: NodeMapState["layoutSpacing"];
  collapseVisibleNodeIds: ReadonlySet<number>;
  resolutionVisibleNodeIds: ReadonlySet<number>;
  depthVisibleNodeIds: ReadonlySet<number>;
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
  treeDirection,
  layoutSpacing,
  collapseVisibleNodeIds,
  resolutionVisibleNodeIds,
  depthVisibleNodeIds,
  focusVisibleNodeIds,
  focusRootId,
}: UseMapDisplayStateOptions): MapDisplayState {
  const layoutOptions = useMemo((): LayoutNodeForestOptions => (
  resolveLayoutNodeForestOptions({ treeDirection, layoutSpacing })
    ), [layoutSpacing, treeDirection]);

  const projection = useMemo(
    () => projectCollapsedLayout(nodes, layoutMode, collapseVisibleNodeIds, layoutOptions),
    [collapseVisibleNodeIds, layoutMode, layoutOptions, nodes],
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
      depthVisibleNodeIds,
      focusRootId,
    },
  ), [
    collapseVisibleNodeIds,
    depthVisibleNodeIds,
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