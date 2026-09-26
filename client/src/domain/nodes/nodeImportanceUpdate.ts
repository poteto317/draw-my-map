import type { Node } from "@/types/node";
import type { NodeImportance } from "@/types/nodeImportance";

export function replaceNodeImportance(
  nodes: readonly Node[],
  id: number,
  importance: NodeImportance,
): Node[] | null {
  if (!nodes.some((node) => node.id === id)) return null;

  return nodes.map((node) => (
    node.id === id ? { ...node, importance } : node
  ));
}
