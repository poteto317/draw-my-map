import {
  buildNodeForestRelations,
  type NodeForestRelations,
} from "./nodeLayoutForestRelations";
import {
  traverseNodeForest,
  type NodeForestTraversal,
} from "./nodeLayoutForestTraversal";
import type { Node } from "@/types/node";

export type IndexedNodeForest = NodeForestRelations & NodeForestTraversal;

export function indexNodeForest(nodes: readonly Node[]): IndexedNodeForest | null {
  const relations = buildNodeForestRelations(nodes);
  if (!relations) return null;
  const traversal = traverseNodeForest(relations);
  if (!traversal) return null;
  return { ...relations, ...traversal };
}
