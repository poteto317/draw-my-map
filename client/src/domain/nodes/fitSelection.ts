import type { Node } from "@/types/node";

export function filterSelectedFitNodes(
  fitNodes: readonly Node[],
  visibleNodeIds: ReadonlySet<number>,
  selectedNodeIds: readonly number[],
): readonly Node[] {
  const ids = new Set(selectedNodeIds);
  return fitNodes.filter(({ id }) => ids.has(id) && visibleNodeIds.has(id));
}
