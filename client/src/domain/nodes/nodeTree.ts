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

export function canConnectNodes(
  nodes: readonly Node[],
  parentId: number,
  childId: number,
): boolean {
  if (parentId === childId) return false;

  const nodeIds = new Set(nodes.map((node) => node.id));
  if (!nodeIds.has(parentId) || !nodeIds.has(childId)) return false;

  return !collectSubtreeIds(nodes, childId).has(parentId);
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
