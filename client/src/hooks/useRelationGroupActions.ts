import { useCallback, useMemo, useRef, useState } from "react";
import { nodesSelection } from "@/domain/map/mapCanvasSelectionGuards";
import {
  planAddGroup,
  planRemoveGroup,
  planUpdateGroupLabel,
  type AddGroupFailureReason,
  type RemoveGroupFailureReason,
  type UpdateGroupLabelFailureReason,
} from "@/domain/map/mapGroupMutation";
import {
  planAddRelation,
  planRemoveRelation,
  planUpdateRelation,
  type AddRelationFailureReason,
  type RemoveRelationFailureReason,
  type UpdateRelationFailureReason,
} from "@/domain/map/mapRelationMutation";
import type { NodeIdAllocator } from "@/domain/nodes/nodeIdAllocator";
import type { StateChange } from "@/hooks/useNodeLayoutState";
import type { MapCanvasSelection } from "@/types/mapCanvasSelection";
import type { MapRelation } from "@/types/mapRelation";

export type AddRelationOutcome =
  | { ok: true; relationId: number }
  | { ok: false; reason: AddRelationFailureReason };

export type RemoveRelationOutcome =
  | { ok: true }
  | { ok: false; reason: RemoveRelationFailureReason };

export type UpdateRelationOutcome =
  | { ok: true }
  | { ok: false; reason: UpdateRelationFailureReason };

export type AddGroupOutcome =
  | { ok: true; groupId: number }
  | { ok: false; reason: AddGroupFailureReason };

export type RemoveGroupOutcome =
  | { ok: true }
  | { ok: false; reason: RemoveGroupFailureReason };

export type UpdateGroupLabelOutcome =
  | { ok: true }
  | { ok: false; reason: UpdateGroupLabelFailureReason };

type NonNodeCanvasSelection =
  | { type: "relation"; id: number }
  | { type: "group"; id: number };

type UseRelationGroupActionsArgs = {
  selectedNodeIds: readonly number[];
  applyStateChangeRaw: (update: StateChange) => boolean;
  nodeIdAllocator: NodeIdAllocator;
};

// 関連線／グループのキャンバス選択と CRUD。ノード操作のガード用 isNodeOpBlocked もここが正本
export function useRelationGroupActions({
  selectedNodeIds,
  applyStateChangeRaw,
  nodeIdAllocator,
}: UseRelationGroupActionsArgs) {
  const [nonNodeSelection, setNonNodeSelection] = useState<NonNodeCanvasSelection | null>(null);
  const nonNodeSelectionRef = useRef<NonNodeCanvasSelection | null>(null);

  const canvasSelection = useMemo<MapCanvasSelection>(
    () => (nonNodeSelection !== null ? nonNodeSelection : nodesSelection(selectedNodeIds)),
    [nonNodeSelection, selectedNodeIds],
  );

  const clearNonNodeSelection = useCallback(() => {
    nonNodeSelectionRef.current = null;
    setNonNodeSelection(null);
  }, []);

  const isNodeOpBlocked = useCallback(
    () => nonNodeSelectionRef.current !== null,
    [],
  );

  const selectRelation = useCallback((id: number) => {
    const next: NonNodeCanvasSelection = { type: "relation", id };
    nonNodeSelectionRef.current = next;
    setNonNodeSelection(next);
  }, []);

  const selectGroup = useCallback((id: number) => {
    const next: NonNodeCanvasSelection = { type: "group", id };
    nonNodeSelectionRef.current = next;
    setNonNodeSelection(next);
  }, []);

  const addRelation = useCallback((fromId: number, toId: number): AddRelationOutcome => {
    let outcome: AddRelationOutcome = { ok: false, reason: "missing-node" };
    const applied = applyStateChangeRaw((current) => {
      const newId = nodeIdAllocator.nextAvailableEntityIds(current, 1)[0]!;
      const planned = planAddRelation({
        nodes: current.nodes,
        relations: current.relations,
        fromId,
        toId,
        newId,
      });
      if (!planned.ok) {
        outcome = planned;
        return null;
      }
      outcome = { ok: true, relationId: planned.relation.id };
      return { ...current, relations: planned.relations };
    });
    if (!applied && outcome.ok) return { ok: false, reason: "missing-node" };
    return outcome;
  }, [applyStateChangeRaw, nodeIdAllocator]);

  const removeRelation = useCallback((relationId: number): RemoveRelationOutcome => {
    let outcome: RemoveRelationOutcome = { ok: false, reason: "missing" };
    const applied = applyStateChangeRaw((current) => {
      const planned = planRemoveRelation({
        nodes: current.nodes,
        relations: current.relations,
        relationId,
      });
      if (!planned.ok) {
        outcome = planned;
        return null;
      }
      outcome = { ok: true };
      return { ...current, relations: planned.relations };
    });
    if (!applied) return outcome.ok ? { ok: false, reason: "missing" } : outcome;
    if (
      nonNodeSelectionRef.current?.type === "relation"
      && nonNodeSelectionRef.current.id === relationId
    ) {
      clearNonNodeSelection();
    }
    return outcome;
  }, [applyStateChangeRaw, clearNonNodeSelection]);

  const updateRelation = useCallback((
    relationId: number,
    patch: { kind?: MapRelation["kind"]; directed?: boolean },
  ): UpdateRelationOutcome => {
    let outcome: UpdateRelationOutcome = { ok: false, reason: "missing" };
    const applied = applyStateChangeRaw((current) => {
      const planned = planUpdateRelation({
        nodes: current.nodes,
        relations: current.relations,
        relationId,
        kind: patch.kind,
        directed: patch.directed,
      });
      if (!planned.ok) {
        outcome = planned;
        return null;
      }
      outcome = { ok: true };
      return { ...current, relations: planned.relations };
    });
    if (!applied && outcome.ok) return { ok: false, reason: "missing" };
    return outcome;
  }, [applyStateChangeRaw]);

  const addGroup = useCallback((nodeIds: readonly number[], label?: string): AddGroupOutcome => {
    let outcome: AddGroupOutcome = { ok: false, reason: "missing-node" };
    const applied = applyStateChangeRaw((current) => {
      const newId = nodeIdAllocator.nextAvailableEntityIds(current, 1)[0]!;
      const planned = planAddGroup({
        nodes: current.nodes,
        groups: current.groups,
        nodeIds,
        newId,
        label,
      });
      if (!planned.ok) {
        outcome = planned;
        return null;
      }
      outcome = { ok: true, groupId: planned.group.id };
      return { ...current, groups: planned.groups };
    });
    if (!applied && outcome.ok) return { ok: false, reason: "missing-node" };
    return outcome;
  }, [applyStateChangeRaw, nodeIdAllocator]);

  const removeGroup = useCallback((groupId: number): RemoveGroupOutcome => {
    let outcome: RemoveGroupOutcome = { ok: false, reason: "missing" };
    const applied = applyStateChangeRaw((current) => {
      const planned = planRemoveGroup({
        nodes: current.nodes,
        groups: current.groups,
        groupId,
      });
      if (!planned.ok) {
        outcome = planned;
        return null;
      }
      outcome = { ok: true };
      return { ...current, groups: planned.groups };
    });
    if (!applied) return outcome.ok ? { ok: false, reason: "missing" } : outcome;
    if (
      nonNodeSelectionRef.current?.type === "group"
      && nonNodeSelectionRef.current.id === groupId
    ) {
      clearNonNodeSelection();
    }
    return outcome;
  }, [applyStateChangeRaw, clearNonNodeSelection]);

  const updateGroupLabel = useCallback((
    groupId: number,
    label: string,
  ): UpdateGroupLabelOutcome => {
    let outcome: UpdateGroupLabelOutcome = { ok: false, reason: "missing" };
    const applied = applyStateChangeRaw((current) => {
      const planned = planUpdateGroupLabel({
        nodes: current.nodes,
        groups: current.groups,
        groupId,
        label,
      });
      if (!planned.ok) {
        outcome = planned;
        return null;
      }
      outcome = { ok: true };
      return { ...current, groups: planned.groups };
    });
    if (!applied && outcome.ok) return { ok: false, reason: "missing" };
    return outcome;
  }, [applyStateChangeRaw]);

  return {
    canvasSelection,
    clearNonNodeSelection,
    isNodeOpBlocked,
    selectRelation,
    selectGroup,
    addRelation,
    removeRelation,
    updateRelation,
    addGroup,
    removeGroup,
    updateGroupLabel,
  };
}
