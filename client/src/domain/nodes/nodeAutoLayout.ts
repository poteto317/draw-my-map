import { calculateNodePositions } from "@/domain/nodes/nodeLayoutGeometry";
import { indexNodeForest } from "@/domain/nodes/nodeLayoutForest";
import type { Node } from "@/types/node";

export function layoutNodeForest(nodes: readonly Node[]): Node[] | null {
  const forest = indexNodeForest(nodes);
  if (!forest) return null;
  const positions = calculateNodePositions(forest);
  if (!positions) return null;
  return nodes.map((node) => {
    const point = positions.get(node.id)!;
    return point.x === node.x && point.y === node.y
      ? node
      : { ...node, x: point.x, y: point.y };
  });
}
