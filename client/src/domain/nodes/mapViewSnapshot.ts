import { resolveResolutionLevel } from "@/domain/nodes/nodeResolutionLevel";
import {
  collectAncestorIds,
  collectSubtreeIds,
  deriveNodeCollapse,
  type NodeCollapseIndex,
} from "@/domain/nodes/nodeCollapse";
import { collectVisibleNodeIds } from "@/domain/nodes/nodeVisibility";
import { pruneMissing } from "@/domain/selection/nodeSelection";
import type { MapViewSnapshot } from "@/types/mapViewSnapshot";
import type { Node } from "@/types/node";

function sameIds(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((id) => rightSet.has(id));
}

export function isSameMapView(left: MapViewSnapshot, right: MapViewSnapshot): boolean {
  return left.viewport.offsetX === right.viewport.offsetX
    && left.viewport.offsetY === right.viewport.offsetY
    && left.viewport.scale === right.viewport.scale
    && left.selectedNodeId === right.selectedNodeId
    && sameIds(left.selectedNodeIds, right.selectedNodeIds)
    && left.focusRootId === right.focusRootId
    && sameIds(left.collapsedNodeIds, right.collapsedNodeIds)
    && left.resolutionMode === right.resolutionMode
    && left.autoResolutionLevel === right.autoResolutionLevel;
}

export function resolveRestoredMapView(snapshot: MapViewSnapshot, nodes: readonly Node[], index: NodeCollapseIndex | null) {
  const ancestors = index && snapshot.focusRootId !== null ? collectAncestorIds(index, snapshot.focusRootId) : null;
  const focusRootId = ancestors ? snapshot.focusRootId : null;
  const focusIds = index && focusRootId !== null ? collectSubtreeIds(index, focusRootId) : null;
  const collapsedIds = new Set(snapshot.collapsedNodeIds);
  ancestors?.forEach((id) => collapsedIds.delete(id));
  const collapse = index ? deriveNodeCollapse(index, collapsedIds) : null;
  const level = resolveResolutionLevel(snapshot.resolutionMode, snapshot.viewport.scale, snapshot.autoResolutionLevel);
  const resolutionIds = collectVisibleNodeIds(nodes, level);
  const visibleIds = new Set<number>();
  for (const { id } of nodes) {
    if ((focusIds?.has(id) ?? true) && (collapse?.visibleNodeIds.has(id) ?? true)
      && (id === focusRootId || resolutionIds.has(id))) visibleIds.add(id);
  }

  const selection = pruneMissing({
    primaryId: snapshot.selectedNodeId,
    anchorId: snapshot.selectedNodeId,
    selectedIds: new Set(snapshot.selectedNodeIds),
  }, visibleIds, nodes.map(({ id }) => id));
  const validCollapsedIds = collapse?.collapsedNodeIds ?? new Set<number>();
  const normalized: MapViewSnapshot = {
    ...snapshot,
    focusRootId,
    collapsedNodeIds: [...validCollapsedIds],
    selectedNodeId: selection.primaryId,
    selectedNodeIds: [...selection.selectedIds],
    autoResolutionLevel: snapshot.resolutionMode === "auto" ? level : snapshot.autoResolutionLevel,
  };

  return { selection, collapsedIds: validCollapsedIds, normalized };
}
