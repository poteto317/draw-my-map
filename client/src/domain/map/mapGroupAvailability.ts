import { isDocumentBlocked } from "@/domain/map/mapDocumentEditGuards";
import { assertNodesEditable } from "@/domain/nodes/nodeEditLock";
import { collectSubtreeIds } from "@/domain/nodes/nodeTree";
import type { MapGroup } from "@/types/mapGroup";
import type { Node } from "@/types/node";
import type { EditorViewMode } from "@/domain/view/editorViewMode";

export type GroupMutationGuardInput = {
  viewMode: EditorViewMode;
  isProtectedMode: boolean;
  hasConflict: boolean;
  isExternallyDeleted: boolean;
};

export type GroupCreateMenuInput = GroupMutationGuardInput & {
  selectedNodeIds: readonly number[];
  nodes: readonly Node[];
};

export type BranchGroupMenuInput = GroupMutationGuardInput & {
  selectedNodeId: number | null;
  selectedNodeIds: readonly number[];
  contextMenuNodeId: number;
  nodes: readonly Node[];
};

export type GroupDeleteAvailabilityInput = GroupMutationGuardInput & {
  nodes: readonly Node[];
  group: MapGroup | undefined;
};

export type GroupMenuState = {
  visible: boolean;
  disabled: boolean;
};

/** N6: 選択≥2 →「グループ化」 */
export function resolveGroupCreateContextMenu(input: GroupCreateMenuInput): GroupMenuState {
  const { viewMode, selectedNodeIds, nodes } = input;
  const visible = viewMode === "map" && selectedNodeIds.length >= 2;
  if (!visible) return { visible: false, disabled: false };

  const disabled = isDocumentBlocked(input)
    || !assertNodesEditable(selectedNodeIds, nodes).ok;

  return { visible: true, disabled };
}

/** N7: 主選択1・subtree≥2 →「この枝をグループ化」 */
export function resolveBranchGroupContextMenu(input: BranchGroupMenuInput): GroupMenuState {
  const {
    viewMode,
    selectedNodeId,
    selectedNodeIds,
    contextMenuNodeId,
    nodes,
  } = input;

  const visible = viewMode === "map"
    && selectedNodeId !== null
    && selectedNodeIds.length === 1
    && selectedNodeId === contextMenuNodeId
    && nodes.some((node) => node.id === selectedNodeId);

  if (!visible) return { visible: false, disabled: false };

  const subtreeIds = [...collectSubtreeIds(nodes, selectedNodeId)];
  if (subtreeIds.length < 2) return { visible: false, disabled: false };

  const disabled = isDocumentBlocked(input)
    || !assertNodesEditable(subtreeIds, nodes).ok;

  return { visible: true, disabled };
}

/** N9: グループ削除の可否 */
export function resolveGroupDeleteAvailability(
  input: GroupDeleteAvailabilityInput,
): { enabled: boolean } {
  const { group, nodes } = input;
  if (group === undefined) return { enabled: false };
  if (isDocumentBlocked(input)) return { enabled: false };
  if (!assertNodesEditable(group.nodeIds, nodes).ok) return { enabled: false };
  return { enabled: true };
}

/** N10: ラベル編集 — 削除と同じガード */
export function resolveGroupLabelEditAvailability(
  input: GroupDeleteAvailabilityInput,
): { enabled: boolean } {
  return resolveGroupDeleteAvailability(input);
}

/** コンテキスト「この枝をグループ化」用のメンバー ID */
export function branchGroupMemberIds(
  nodes: readonly Node[],
  rootId: number,
): readonly number[] | null {
  const ids = [...collectSubtreeIds(nodes, rootId)];
  return ids.length >= 2 ? ids : null;
}
