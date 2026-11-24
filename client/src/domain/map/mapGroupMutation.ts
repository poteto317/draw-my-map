import { assertNodesEditable } from "@/domain/nodes/nodeEditLock";
import { MAP_GROUP_LABEL_MAX_CODEPOINTS, type MapGroup } from "@/types/mapGroup";
import type { Node } from "@/types/node";
import type { NodeMapState } from "@/types/nodeMapState";

export type AddGroupFailureReason =
  | "missing-node"
  | "too-few"
  | "locked"
  | "too-long";

export type RemoveGroupFailureReason =
  | "missing"
  | "locked";

export type UpdateGroupLabelFailureReason =
  | "missing"
  | "locked"
  | "noop"
  | "too-long";

export type AddGroupResult =
  | { ok: true; group: MapGroup; groups: readonly MapGroup[] }
  | { ok: false; reason: AddGroupFailureReason };

export type RemoveGroupResult =
  | { ok: true; groups: readonly MapGroup[] | undefined }
  | { ok: false; reason: RemoveGroupFailureReason };

export type UpdateGroupLabelResult =
  | { ok: true; group: MapGroup; groups: readonly MapGroup[] }
  | { ok: false; reason: UpdateGroupLabelFailureReason };

function uniqueExistingIds(
  nodeIds: readonly number[],
  idSet: ReadonlySet<number>,
): { ids: number[]; missing: boolean } {
  const unique: number[] = [];
  const seen = new Set<number>();
  let missing = false;
  for (const id of nodeIds) {
    if (!idSet.has(id)) {
      missing = true;
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  return { ids: unique, missing };
}

export function planAddGroup(args: {
  nodes: readonly Node[];
  groups: readonly MapGroup[] | undefined;
  nodeIds: readonly number[];
  newId: number;
  label?: string;
}): AddGroupResult {
  const { nodes, groups, nodeIds, newId } = args;
  const label = args.label ?? "";
  if (Array.from(label).length > MAP_GROUP_LABEL_MAX_CODEPOINTS) {
    return { ok: false, reason: "too-long" };
  }
  const idSet = new Set(nodes.map((node) => node.id));
  const { ids, missing } = uniqueExistingIds(nodeIds, idSet);
  if (missing) return { ok: false, reason: "missing-node" };
  if (ids.length < 2) return { ok: false, reason: "too-few" };

  const lockedCheck = assertNodesEditable(ids, nodes);
  if (!lockedCheck.ok) {
    if (lockedCheck.reason === "locked") return { ok: false, reason: "locked" };
    return { ok: false, reason: "missing-node" };
  }

  const draft: MapGroup = {
    id: newId,
    nodeIds: ids,
    label,
  };
  return {
    ok: true,
    group: draft,
    groups: [...(groups ?? []), draft],
  };
}

export function planRemoveGroup(args: {
  nodes: readonly Node[];
  groups: readonly MapGroup[] | undefined;
  groupId: number;
}): RemoveGroupResult {
  const { nodes, groups, groupId } = args;
  const existing = (groups ?? []).find((entry) => entry.id === groupId);
  if (existing === undefined) return { ok: false, reason: "missing" };

  const lockedCheck = assertNodesEditable(existing.nodeIds, nodes);
  if (!lockedCheck.ok && lockedCheck.reason === "locked") {
    return { ok: false, reason: "locked" };
  }

  const next = (groups ?? []).filter((entry) => entry.id !== groupId);
  return {
    ok: true,
    groups: next.length === 0 ? undefined : next,
  };
}

export function planUpdateGroupLabel(args: {
  nodes: readonly Node[];
  groups: readonly MapGroup[] | undefined;
  groupId: number;
  label: string;
}): UpdateGroupLabelResult {
  const { nodes, groups, groupId, label } = args;
  if (Array.from(label).length > MAP_GROUP_LABEL_MAX_CODEPOINTS) {
    return { ok: false, reason: "too-long" };
  }
  const existing = (groups ?? []).find((entry) => entry.id === groupId);
  if (existing === undefined) return { ok: false, reason: "missing" };

  const lockedCheck = assertNodesEditable(existing.nodeIds, nodes);
  if (!lockedCheck.ok && lockedCheck.reason === "locked") {
    return { ok: false, reason: "locked" };
  }
  if (existing.label === label) return { ok: false, reason: "noop" };

  const next: MapGroup = { ...existing, label };
  return {
    ok: true,
    group: next,
    groups: (groups ?? []).map((entry) => (entry.id === groupId ? next : entry)),
  };
}

export function withGroups(
  state: NodeMapState,
  groups: readonly MapGroup[] | undefined,
): NodeMapState {
  return { ...state, groups };
}
