import {
  collectAncestorIds,
  type NodeCollapseIndex,
} from "@/domain/nodes/nodeCollapse";
import type { Node } from "@/types/node";

export function buildNodeBreadcrumb(
  index: NodeCollapseIndex | null,
  nodeId: number | null,
): readonly Node[] {
  if (!index || nodeId === null) return [];
  const ancestors = collectAncestorIds(index, nodeId);
  if (ancestors === null) return [];
  return [...ancestors].reverse().concat(nodeId).flatMap((id) => {
    const node = index.nodesById.get(id);
    return node ? [node] : [];
  });
}
