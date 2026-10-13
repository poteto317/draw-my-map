import {
  type AllocateNodeIds,
  insertNodeSubtree,
  type SubtreeInsertionResult,
} from "@/domain/nodes/nodeSubtreeInsertion";
import { collectSubtreeIds } from "@/domain/nodes/nodeTree";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";

export type DuplicateSubtreeResult = SubtreeInsertionResult;

export function duplicateNodeSubtree(
  nodes: readonly Node[],
  sourceId: number,
  mode: NodeLayoutMode,
  allocateIds: AllocateNodeIds,
): DuplicateSubtreeResult | null {
  const sourceRoot = nodes.find((node) => node.id === sourceId);
  if (sourceRoot === undefined) return null;

  const subtreeIds = collectSubtreeIds(nodes, sourceId);
  const sources = nodes.filter((node) => subtreeIds.has(node.id));
  return insertNodeSubtree(
    nodes,
    sources,
    sourceId,
    sourceRoot.parentId,
    mode,
    allocateIds,
    "duplicate",
  );
}
