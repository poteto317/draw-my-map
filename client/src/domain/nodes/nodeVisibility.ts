import { isNodeVisibleAtLevel } from "@/domain/nodes/nodeResolution";
import type { Node } from "@/types/node";
import type { ResolutionLevel } from "@/types/nodeResolution";

export function collectVisibleNodeIds(
  nodes: readonly Node[],
  level: ResolutionLevel,
): ReadonlySet<number> {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const includedNodeIds = new Set<number>();
  const processedNodeIds = new Set<number>();

  for (const node of nodes) {
    if (!isNodeVisibleAtLevel(node.importance, level) || processedNodeIds.has(node.id)) {
      continue;
    }

    let currentNode: Node | undefined = node;

    while (currentNode !== undefined && !processedNodeIds.has(currentNode.id)) {
      includedNodeIds.add(currentNode.id);
      processedNodeIds.add(currentNode.id);
      const parentId: number | null = currentNode.parentId;
      currentNode = parentId === null
        ? undefined
        : nodesById.get(parentId);
    }
  }

  return new Set(nodes
    .filter((node) => includedNodeIds.has(node.id))
    .map((node) => node.id));
}
