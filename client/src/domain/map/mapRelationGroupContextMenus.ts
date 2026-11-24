import {
  resolveBranchGroupContextMenu,
  resolveGroupCreateContextMenu,
  type GroupMenuState,
  type GroupMutationGuardInput,
} from "@/domain/map/mapGroupAvailability";
import {
  resolveRelationAddContextMenu,
  resolveRelationConnectContextMenu,
  type RelationMenuState,
} from "@/domain/map/mapRelationAvailability";
import type { MapRelation } from "@/types/mapRelation";
import type { Node } from "@/types/node";

export type MapRelationGroupContextMenusInput = GroupMutationGuardInput & {
  menuNodeId: number | null;
  selectedNodeId: number | null;
  selectedNodeIds: readonly number[];
  nodes: readonly Node[];
  relations: readonly MapRelation[] | undefined;
};

export type MapRelationGroupContextMenus = {
  relationAdd: RelationMenuState;
  relationConnect: RelationMenuState;
  groupCreate: GroupMenuState;
  branchGroup: GroupMenuState;
};

const HIDDEN: RelationMenuState = { visible: false, disabled: false };

/** MapStage 右クリック向け。関連線／グループ系メニューの可視・無効を一括解決する */
export function resolveMapRelationGroupContextMenus(
  input: MapRelationGroupContextMenusInput,
): MapRelationGroupContextMenus {
  const { menuNodeId } = input;
  if (menuNodeId === null) {
    return {
      relationAdd: HIDDEN,
      relationConnect: HIDDEN,
      groupCreate: HIDDEN,
      branchGroup: HIDDEN,
    };
  }

  const guard = {
    viewMode: input.viewMode,
    isProtectedMode: input.isProtectedMode,
    hasConflict: input.hasConflict,
    isExternallyDeleted: input.isExternallyDeleted,
  };

  return {
    relationAdd: resolveRelationAddContextMenu({
      ...guard,
      selectedNodeId: input.selectedNodeId,
      selectedNodeIds: input.selectedNodeIds,
      contextMenuNodeId: menuNodeId,
      nodes: input.nodes,
      relations: input.relations,
    }),
    relationConnect: resolveRelationConnectContextMenu({
      ...guard,
      selectedNodeIds: input.selectedNodeIds,
      nodes: input.nodes,
      relations: input.relations,
    }),
    groupCreate: resolveGroupCreateContextMenu({
      ...guard,
      selectedNodeIds: input.selectedNodeIds,
      nodes: input.nodes,
    }),
    branchGroup: resolveBranchGroupContextMenu({
      ...guard,
      selectedNodeId: input.selectedNodeId,
      selectedNodeIds: input.selectedNodeIds,
      contextMenuNodeId: menuNodeId,
      nodes: input.nodes,
    }),
  };
}
