import { assertNodesEditable } from "@/domain/nodes/nodeEditLock";
import { listBranchExtractEditableIds } from "@/domain/nodes/branchExtractEditableIds";
import type { EditorViewMode } from "@/domain/view/editorViewMode";
import type { Node } from "@/types/node";

export type BranchExtractContextMenuInput = {
  viewMode: EditorViewMode;
  selectedNodeId: number | null;
  selectedNodeIds: readonly number[];
  nodes: readonly Node[];
  contextMenuNodeId: number;
  isProtectedMode: boolean;
  hasConflict: boolean;
  isExternallyDeleted: boolean;
};

export type BranchExtractContextMenuState = {
  visible: boolean;
  disabled: boolean;
};

export function resolveBranchExtractContextMenu(input: BranchExtractContextMenuInput): BranchExtractContextMenuState {
  const {
    viewMode,
    selectedNodeId,
    selectedNodeIds,
    nodes,
    contextMenuNodeId,
    isProtectedMode,
    hasConflict,
    isExternallyDeleted,
  } = input;

  const root = nodes.find((node) => node.id === contextMenuNodeId);
  const visible = viewMode === "map"
    && selectedNodeId !== null
    && selectedNodeIds.length === 1
    && selectedNodeId === contextMenuNodeId
    && root !== undefined
    && root.parentId !== null;

  if (!visible) return { visible: false, disabled: false };

  const disabled = isProtectedMode
    || hasConflict
    || isExternallyDeleted
    || !assertNodesEditable(listBranchExtractEditableIds(nodes, contextMenuNodeId), nodes).ok;

  return { visible: true, disabled };
}