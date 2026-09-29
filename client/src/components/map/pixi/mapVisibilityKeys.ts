import type { Node } from "@/types/node";

export function nodeVisibilityKey(nodeId: number): string {
  return `node:${nodeId}`;
}

export function edgeVisibilityKey(childNodeId: number): string {
  return `edge:${childNodeId}`;
}

export function collectVisibleMapKeys(
  nodes: readonly Node[],
  visibleNodeIds: ReadonlySet<number>,
): ReadonlySet<string> {
  const visibleKeys = new Set<string>();
  const nodesById = new Set(nodes.map((node) => node.id));

  for (const node of nodes) {
    if (!visibleNodeIds.has(node.id)) continue;

    visibleKeys.add(nodeVisibilityKey(node.id));
    if (
      node.parentId !== null
      && visibleNodeIds.has(node.parentId)
      && nodesById.has(node.parentId)
    ) {
      visibleKeys.add(edgeVisibilityKey(node.id));
    }
  }

  return visibleKeys;
}
