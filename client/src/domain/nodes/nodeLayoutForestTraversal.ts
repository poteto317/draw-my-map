import type { Node } from "@/types/node";
import type { NodeForestRelations } from "./nodeLayoutForestRelations";

export type NodeForestTraversal = {
  depthById: ReadonlyMap<number, number>;
  nodesByDepth: readonly (readonly Node[])[];
  postOrder: readonly Node[];
};

type TraversalFrame = {
  node: Node;
  depth: number;
  exiting: boolean;
};

export function traverseNodeForest(
  relations: NodeForestRelations,
): NodeForestTraversal | null {
  const depthById = new Map<number, number>();
  const nodesByDepth: Node[][] = [];
  const postOrder: Node[] = [];
  const stack: TraversalFrame[] = [...relations.roots]
    .reverse()
    .map((node) => ({ node, depth: 0, exiting: false }));
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
    const children = relations.childrenByParent.get(frame.node.id) ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ node: children[index], depth: frame.depth + 1, exiting: false });
    }
  }
  if (depthById.size !== relations.nodes.length) return null;

  return { depthById, nodesByDepth, postOrder };
}
