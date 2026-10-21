import { collectAncestorIds, type NodeCollapseIndex } from "@/domain/nodes/nodeCollapse";
import { resolveMinimumVisibleLevel } from "@/domain/nodes/nodeResolution";
import type { ResolutionLevel } from "@/types/nodeResolution";

type NodeSearchRevealOptions = {
  index: NodeCollapseIndex | null;
  collapsedNodeIds: ReadonlySet<number>;
  resolutionVisibleNodeIds: ReadonlySet<number>;
  nodeId: number;
};

type NodeSearchReveal = {
  ancestorIdsToExpand: readonly number[];
  resolutionLevel: ResolutionLevel | null;
};

export function resolveNodeSearchReveal({
  index, collapsedNodeIds, resolutionVisibleNodeIds, nodeId,
}: NodeSearchRevealOptions): NodeSearchReveal | null {
  if (index === null) return null;
  const node = index.nodesById.get(nodeId);
  const ancestors = collectAncestorIds(index, nodeId);
  if (node === undefined || ancestors === null) return null;
  return {
    ancestorIdsToExpand: ancestors.filter(id => collapsedNodeIds.has(id)),
    resolutionLevel: resolutionVisibleNodeIds.has(nodeId)
      ? null
      : resolveMinimumVisibleLevel(node.importance),
  };
}
