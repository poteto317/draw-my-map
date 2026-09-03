import type { Node } from "@/types/node";

export function collectSubtreeIds(nodes: readonly Node[], rootId: number): Set<number> {
  const ids = new Set<number>([rootId]);
  let changed = true;

  while (changed) {
    changed = false;

    for (const node of nodes) {
      if (node.parentId !== null && ids.has(node.parentId) && !ids.has(node.id)) {
        ids.add(node.id);
        changed = true;
      }
    }
  }

  return ids;
}

function hasAncestorOrCycle(
  nodesById: ReadonlyMap<number, Node>,
  nodeId: number,
  ancestorId: number,
): boolean {
  const visitedIds = new Set<number>();
  let currentId: number | null = nodeId;

  while (currentId !== null) {
    if (currentId === ancestorId) return true;
    if (visitedIds.has(currentId)) return true;
    visitedIds.add(currentId);
    currentId = nodesById.get(currentId)?.parentId ?? null;
  }

  return false;
}

export function canConnectNodes(
  nodes: readonly Node[],
  parentId: number,
  childId: number,
): boolean {
  if (parentId === childId) return false;

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  if (!nodesById.has(parentId) || !nodesById.has(childId)) return false;

  return !hasAncestorOrCycle(nodesById, parentId, childId);
}

export function connectNodeTree(
  nodes: readonly Node[],
  parentId: number,
  childId: number,
): Node[] | null {
  if (!canConnectNodes(nodes, parentId, childId)) return null;

  return nodes.map((node) => (
    node.id === childId ? { ...node, parentId } : node
  ));
}
