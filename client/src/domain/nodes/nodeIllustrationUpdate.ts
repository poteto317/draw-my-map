import { ILLUSTRATED_NODE_HEIGHT } from "@/config/shapes";
import type { Node } from "@/types/node";

export function replaceNodeIllustration(
  nodes: readonly Node[],
  id: number,
  dataUrl: string,
): Node[] | null {
  if (!nodes.some((node) => node.id === id)) return null;

  return nodes.map((node) => (
    node.id === id ? { ...node, illustration: dataUrl, height: ILLUSTRATED_NODE_HEIGHT } : node
  ));
}
