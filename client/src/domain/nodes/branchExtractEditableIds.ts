import { collectSubtreeIds } from "@/domain/nodes/nodeTree";
import type { Node } from "@/types/node";

/** 枝切り出しで編集ロックを検査するノード id（部分木＋必要なら離脱元親）。 */
export function listBranchExtractEditableIds(nodes: readonly Node[], rootId: number): readonly number[] {
  const root = nodes.find((node) => node.id === rootId);
  if (root === undefined) return [];
  const branchIds = [...collectSubtreeIds(nodes, rootId)];
  const parent = root.parentId === null
    ? undefined
    : nodes.find((node) => node.id === root.parentId);
  const editableIds = [...branchIds];
  const parentId = root.parentId;
  if (parent !== undefined && parent.parentId !== null && parentId !== null) {
    editableIds.push(parentId);
  }
  return editableIds;
}