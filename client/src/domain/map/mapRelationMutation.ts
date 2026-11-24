import { assertNodesEditable } from "@/domain/nodes/nodeEditLock";
import { canCommitRelation } from "@/domain/map/relationConflict";
import type { MapRelation } from "@/types/mapRelation";
import type { Node } from "@/types/node";
import type { NodeMapState } from "@/types/nodeMapState";

export type AddRelationFailureReason =
  | "missing-node"
  | "same-node"
  | "duplicate"
  | "locked";

export type RemoveRelationFailureReason =
  | "missing"
  | "locked";

export type UpdateRelationFailureReason =
  | "missing"
  | "locked"
  | "duplicate"
  | "noop";

export type AddRelationResult =
  | { ok: true; relation: MapRelation; relations: readonly MapRelation[] }
  | { ok: false; reason: AddRelationFailureReason };

export type RemoveRelationResult =
  | { ok: true; relations: readonly MapRelation[] | undefined }
  | { ok: false; reason: RemoveRelationFailureReason };

export type UpdateRelationResult =
  | { ok: true; relation: MapRelation; relations: readonly MapRelation[] }
  | { ok: false; reason: UpdateRelationFailureReason };

const DEFAULT_KIND = "related" as const;
const DEFAULT_DIRECTED = false;

export function planAddRelation(args: {
  nodes: readonly Node[];
  relations: readonly MapRelation[] | undefined;
  fromId: number;
  toId: number;
  newId: number;
  kind?: MapRelation["kind"];
  directed?: boolean;
}): AddRelationResult {
  const { nodes, relations, fromId, toId, newId } = args;
  if (fromId === toId) return { ok: false, reason: "same-node" };

  const idSet = new Set(nodes.map((node) => node.id));
  if (!idSet.has(fromId) || !idSet.has(toId)) return { ok: false, reason: "missing-node" };

  const lockedCheck = assertNodesEditable([fromId, toId], nodes);
  if (!lockedCheck.ok) {
    if (lockedCheck.reason === "locked") return { ok: false, reason: "locked" };
    return { ok: false, reason: "missing-node" };
  }

  const draft: MapRelation = {
    id: newId,
    fromId,
    toId,
    kind: args.kind ?? DEFAULT_KIND,
    directed: args.directed ?? DEFAULT_DIRECTED,
  };
  if (!canCommitRelation(relations, draft)) return { ok: false, reason: "duplicate" };

  return {
    ok: true,
    relation: draft,
    relations: [...(relations ?? []), draft],
  };
}

export function planRemoveRelation(args: {
  nodes: readonly Node[];
  relations: readonly MapRelation[] | undefined;
  relationId: number;
}): RemoveRelationResult {
  const { nodes, relations, relationId } = args;
  const existing = (relations ?? []).find((relation) => relation.id === relationId);
  if (existing === undefined) return { ok: false, reason: "missing" };

  const lockedCheck = assertNodesEditable([existing.fromId, existing.toId], nodes);
  if (!lockedCheck.ok && lockedCheck.reason === "locked") {
    return { ok: false, reason: "locked" };
  }

  const next = (relations ?? []).filter((relation) => relation.id !== relationId);
  return {
    ok: true,
    relations: next.length === 0 ? undefined : next,
  };
}

export function planUpdateRelation(args: {
  nodes: readonly Node[];
  relations: readonly MapRelation[] | undefined;
  relationId: number;
  kind?: MapRelation["kind"];
  directed?: boolean;
}): UpdateRelationResult {
  const { nodes, relations, relationId } = args;
  const existing = (relations ?? []).find((relation) => relation.id === relationId);
  if (existing === undefined) return { ok: false, reason: "missing" };

  const lockedCheck = assertNodesEditable([existing.fromId, existing.toId], nodes);
  if (!lockedCheck.ok && lockedCheck.reason === "locked") {
    return { ok: false, reason: "locked" };
  }

  const next: MapRelation = {
    ...existing,
    kind: args.kind ?? existing.kind,
    directed: args.directed ?? existing.directed,
  };
  if (next.kind === existing.kind && next.directed === existing.directed) {
    return { ok: false, reason: "noop" };
  }
  if (!canCommitRelation(relations, next, relationId)) {
    return { ok: false, reason: "duplicate" };
  }

  return {
    ok: true,
    relation: next,
    relations: (relations ?? []).map((relation) => (
      relation.id === relationId ? next : relation
    )),
  };
}

export function withRelations(
  state: NodeMapState,
  relations: readonly MapRelation[] | undefined,
): NodeMapState {
  return { ...state, relations };
}
