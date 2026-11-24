import { isDocumentBlocked } from "@/domain/map/mapDocumentEditGuards";
import { assertNodesEditable } from "@/domain/nodes/nodeEditLock";
import { canCommitRelation } from "@/domain/map/relationConflict";
import type { MapRelation } from "@/types/mapRelation";
import type { Node } from "@/types/node";
import type { EditorViewMode } from "@/domain/view/editorViewMode";

export type RelationMutationGuardInput = {
  viewMode: EditorViewMode;
  isProtectedMode: boolean;
  hasConflict: boolean;
  isExternallyDeleted: boolean;
};

export type RelationAddMenuInput = RelationMutationGuardInput & {
  selectedNodeId: number | null;
  selectedNodeIds: readonly number[];
  contextMenuNodeId: number;
  nodes: readonly Node[];
  relations: readonly MapRelation[] | undefined;
};

export type RelationConnectMenuInput = RelationMutationGuardInput & {
  selectedNodeIds: readonly number[];
  nodes: readonly Node[];
  relations: readonly MapRelation[] | undefined;
};

export type RelationDeleteAvailabilityInput = RelationMutationGuardInput & {
  nodes: readonly Node[];
  relation: MapRelation | undefined;
};

export type RelationMenuState = {
  visible: boolean;
  disabled: boolean;
};

/** N1: コンテキスト「関連線を追加」→相手ピッカー */
export function resolveRelationAddContextMenu(input: RelationAddMenuInput): RelationMenuState {
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

  const disabled = isDocumentBlocked(input)
    || !assertNodesEditable([selectedNodeId], nodes).ok;

  return { visible: true, disabled };
}

/** N2: 選択ちょうど 2 →「関連線で結ぶ」 */
export function resolveRelationConnectContextMenu(input: RelationConnectMenuInput): RelationMenuState {
  const { viewMode, selectedNodeIds, nodes, relations } = input;

  const visible = viewMode === "map" && selectedNodeIds.length === 2;
  if (!visible) return { visible: false, disabled: false };

  const [fromId, toId] = selectedNodeIds as [number, number];
  const draft: MapRelation = {
    id: -1,
    fromId,
    toId,
    kind: "related",
    directed: false,
  };
  const disabled = isDocumentBlocked(input)
    || !assertNodesEditable([fromId, toId], nodes).ok
    || !canCommitRelation(relations, draft);

  return { visible: true, disabled };
}

/** N4: 関連線削除の可否（Delete / メニュー） */
export function resolveRelationDeleteAvailability(
  input: RelationDeleteAvailabilityInput,
): { enabled: boolean } {
  const { relation, nodes } = input;
  if (relation === undefined) return { enabled: false };
  if (isDocumentBlocked(input)) return { enabled: false };
  if (!assertNodesEditable([relation.fromId, relation.toId], nodes).ok) {
    return { enabled: false };
  }
  return { enabled: true };
}

/** N5: 意味の編集（右パネル kind / directed）— 削除と同じガード */
export function resolveRelationMeaningEditAvailability(
  input: RelationDeleteAvailabilityInput,
): { enabled: boolean } {
  return resolveRelationDeleteAvailability(input);
}

/** 相手ピッカーで各候補を結べるか（相手 locked / 重複） */
export function canPickRelationPartner(args: {
  nodes: readonly Node[];
  relations: readonly MapRelation[] | undefined;
  fromId: number;
  toId: number;
}): boolean {
  const { nodes, relations, fromId, toId } = args;
  if (fromId === toId) return false;
  if (!assertNodesEditable([fromId, toId], nodes).ok) return false;
  return canCommitRelation(relations, {
    id: -1,
    fromId,
    toId,
    kind: "related",
    directed: false,
  });
}

export type RelationPartnerCandidate = {
  node: Node;
  enabled: boolean;
};

/** 相手ピッカー用の候補一覧（fromId 自身を除く）。純計算 — Dialog の focus / click とは分離 */
export function listRelationPartnerCandidates(args: {
  nodes: readonly Node[];
  relations: readonly MapRelation[] | undefined;
  fromId: number;
}): RelationPartnerCandidate[] {
  const { nodes, relations, fromId } = args;
  const candidates: RelationPartnerCandidate[] = [];
  for (const node of nodes) {
    if (node.id === fromId) continue;
    candidates.push({
      node,
      enabled: canPickRelationPartner({ nodes, relations, fromId, toId: node.id }),
    });
  }
  return candidates;
}
