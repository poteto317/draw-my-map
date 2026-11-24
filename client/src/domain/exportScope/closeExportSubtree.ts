import type { Node } from "@/types/node";

/** 対象 ID とその祖先だけを残す。部分書き出しでも parentId は集合内を指す。 */
export function closeExportSubtree(
  allNodes: readonly Node[],
  targetIds: Iterable<number>,
): readonly Node[] {
  const nodesById = new Map(allNodes.map((node) => [node.id, node]));
  const closedIds = new Set<number>();

  for (const targetId of targetIds) {
    let currentId: number | null = targetId;
    while (currentId !== null && !closedIds.has(currentId)) {
      if (!nodesById.has(currentId)) break;
      closedIds.add(currentId);
      currentId = nodesById.get(currentId)?.parentId ?? null;
    }
  }

  return allNodes.filter((node) => closedIds.has(node.id));
}