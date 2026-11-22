import type { ExportScope } from "@/domain/exportScope/exportScope";
import { collectSubtreeIds } from "@/domain/nodes/nodeTree";
import type { Node } from "@/types/node";

export function resolveExportNodes(
  scope: ExportScope,
  nodes: readonly Node[],
  visibleNodeIds: ReadonlySet<number>,
  selectionTargetIds: readonly number[],
): Node[] {
  if (scope === "all") return [...nodes];

  if (scope === "visible") {
    return nodes.filter((node) => visibleNodeIds.has(node.id));
  }

  if (selectionTargetIds.length !== 1) return [];

  const subtreeIds = collectSubtreeIds(nodes, selectionTargetIds[0]);
  return nodes.filter((node) => subtreeIds.has(node.id));
}
