import type { Node } from "@/types/node";

export type NodeForestRelations = {
  nodes: readonly Node[];
  roots: readonly Node[];
  childrenByParent: ReadonlyMap<number, readonly Node[]>;
};

function isValidNode(node: Node): boolean {
  return Number.isFinite(node.id)
    && Number.isFinite(node.x)
    && Number.isFinite(node.y)
    && Number.isFinite(node.width)
    && Number.isFinite(node.height)
    && node.width > 0
    && node.height > 0;
}

export function buildNodeForestRelations(
  nodes: readonly Node[],
): NodeForestRelations | null {
  const nodesById = new Map<number, Node>();
  const childrenByParent = new Map<number, Node[]>();
  const roots: Node[] = [];

  for (const node of nodes) {
    if (!isValidNode(node) || nodesById.has(node.id)) return null;
    nodesById.set(node.id, node);
  }
  for (const node of nodes) {
    if (node.parentId === null) roots.push(node);
    else {
      if (!nodesById.has(node.parentId)) return null;
      const siblings = childrenByParent.get(node.parentId) ?? [];
      siblings.push(node);
      childrenByParent.set(node.parentId, siblings);
    }
  }

  return { nodes, roots, childrenByParent };
}
