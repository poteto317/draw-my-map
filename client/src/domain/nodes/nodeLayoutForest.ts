import type { Node } from "@/types/node";

export type IndexedNodeForest = {
  nodes: readonly Node[];
  roots: readonly Node[];
  childrenByParent: ReadonlyMap<number, readonly Node[]>;
  depthById: ReadonlyMap<number, number>;
  nodesByDepth: readonly (readonly Node[])[];
  postOrder: readonly Node[];
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

export function indexNodeForest(nodes: readonly Node[]): IndexedNodeForest | null {
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

  const depthById = new Map<number, number>();
  const nodesByDepth: Node[][] = [];
  const postOrder: Node[] = [];
  const stack = [...roots].reverse().map((node) => ({ node, depth: 0, exiting: false }));
  const visiting = new Set<number>();

  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (frame.exiting) {
      visiting.delete(frame.node.id);
      postOrder.push(frame.node);
      continue;
    }
    if (visiting.has(frame.node.id) || depthById.has(frame.node.id)) return null;
    visiting.add(frame.node.id);
    depthById.set(frame.node.id, frame.depth);
    (nodesByDepth[frame.depth] ??= []).push(frame.node);
    stack.push({ ...frame, exiting: true });
    const children = childrenByParent.get(frame.node.id) ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ node: children[index], depth: frame.depth + 1, exiting: false });
    }
  }
  if (depthById.size !== nodes.length) return null;
  return { nodes, roots, childrenByParent, depthById, nodesByDepth, postOrder };
}
