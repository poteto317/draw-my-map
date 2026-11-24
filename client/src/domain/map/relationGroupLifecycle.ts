import { dedupeRelationsByConflict } from "@/domain/map/relationConflict";
import type { MapGroup } from "@/types/mapGroup";
import type { MapRelation } from "@/types/mapRelation";
import type { NodeMapState } from "@/types/nodeMapState";

// 呼び出し側が `{ ...state, ...slice }` で古い配列を残さないよう、キーは常に返す（空は undefined）
export type RelationGroupSlice = {
  relations: readonly MapRelation[] | undefined;
  groups: readonly MapGroup[] | undefined;
};

export type AllocateEntityIds = (
  state: Pick<NodeMapState, "nodes" | "relations" | "groups">,
  count: number,
) => number[];

function toSlice(
  relations: readonly MapRelation[],
  groups: readonly MapGroup[],
): RelationGroupSlice {
  return {
    relations: relations.length === 0 ? undefined : relations,
    groups: groups.length === 0 ? undefined : groups,
  };
}

export function pruneAfterRemovedNodeIds(
  relations: readonly MapRelation[] | undefined,
  groups: readonly MapGroup[] | undefined,
  removedIds: readonly number[],
): RelationGroupSlice {
  const removed = new Set(removedIds);
  const nextRelations = (relations ?? []).filter(
    (relation) => !removed.has(relation.fromId) && !removed.has(relation.toId),
  );
  const nextGroups: MapGroup[] = [];
  for (const current of groups ?? []) {
    const nodeIds = current.nodeIds.filter((id) => !removed.has(id));
    if (nodeIds.length < 2) continue;
    nextGroups.push(nodeIds.length === current.nodeIds.length ? current : { ...current, nodeIds });
  }
  return toSlice(nextRelations, nextGroups);
}

// 枝移動・切り出しの元マップ用。relation は端点欠損を捨て、group は removed と交差すれば丸ごと削除（縮めない）
export function pruneSourceAfterBranchMove(
  relations: readonly MapRelation[] | undefined,
  groups: readonly MapGroup[] | undefined,
  removedIds: readonly number[],
): RelationGroupSlice {
  const removed = new Set(removedIds);
  const nextRelations = (relations ?? []).filter(
    (relation) => !removed.has(relation.fromId) && !removed.has(relation.toId),
  );
  const nextGroups = (groups ?? []).filter(
    (current) => !current.nodeIds.some((id) => removed.has(id)),
  );
  return toSlice(nextRelations, nextGroups);
}

function rewriteEndpoint(id: number, survivorId: number, absorbed: ReadonlySet<number>): number {
  return absorbed.has(id) ? survivorId : id;
}

export function rewriteAfterNodeMerge(
  survivorId: number,
  absorbedIds: readonly number[],
  relations: readonly MapRelation[] | undefined,
  groups: readonly MapGroup[] | undefined,
): RelationGroupSlice {
  const absorbed = new Set(absorbedIds);
  const rewritten: MapRelation[] = [];
  for (const relation of relations ?? []) {
    const fromId = rewriteEndpoint(relation.fromId, survivorId, absorbed);
    const toId = rewriteEndpoint(relation.toId, survivorId, absorbed);
    if (fromId === toId) continue;
    rewritten.push(fromId === relation.fromId && toId === relation.toId ? relation : { ...relation, fromId, toId });
  }
  const nextRelations = dedupeRelationsByConflict(rewritten);

  const nextGroups: MapGroup[] = [];
  for (const current of groups ?? []) {
    const nodeIds: number[] = [];
    const seen = new Set<number>();
    for (const id of current.nodeIds) {
      const nextId = rewriteEndpoint(id, survivorId, absorbed);
      if (seen.has(nextId)) continue;
      seen.add(nextId);
      nodeIds.push(nextId);
    }
    if (nodeIds.length < 2) continue;
    nextGroups.push(
      nodeIds.length === current.nodeIds.length && nodeIds.every((id, index) => id === current.nodeIds[index])
        ? current
        : { ...current, nodeIds },
    );
  }
  return toSlice(nextRelations, nextGroups);
}

function remapEntityId(id: number, idMap: ReadonlyMap<number, number>): number {
  return idMap.get(id) ?? id;
}

export function remapClosedForNodeIdMap(
  relations: readonly MapRelation[] | undefined,
  groups: readonly MapGroup[] | undefined,
  idMap: ReadonlyMap<number, number>,
): RelationGroupSlice {
  const nextRelations: MapRelation[] = [];
  for (const relation of relations ?? []) {
    if (!idMap.has(relation.fromId) || !idMap.has(relation.toId)) continue;
    nextRelations.push({
      ...relation,
      id: remapEntityId(relation.id, idMap),
      fromId: idMap.get(relation.fromId)!,
      toId: idMap.get(relation.toId)!,
    });
  }

  const nextGroups: MapGroup[] = [];
  for (const current of groups ?? []) {
    if (!current.nodeIds.every((id) => idMap.has(id))) continue;
    const nodeIds = current.nodeIds.map((id) => idMap.get(id)!);
    const unique: number[] = [];
    const seen = new Set<number>();
    for (const id of nodeIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      unique.push(id);
    }
    if (unique.length < 2) continue;
    nextGroups.push({
      ...current,
      id: remapEntityId(current.id, idMap),
      nodeIds: unique,
    });
  }
  return toSlice(nextRelations, nextGroups);
}

// 閉じた relation/group だけを nodeIdMapping で写し、entity id は occupied 上で新規採番する
export function copyClosedRelationGroups(
  relations: readonly MapRelation[] | undefined,
  groups: readonly MapGroup[] | undefined,
  nodeIdMapping: ReadonlyMap<number, number>,
  occupied: Pick<NodeMapState, "nodes" | "relations" | "groups">,
  allocateEntityIds: AllocateEntityIds,
): RelationGroupSlice {
  const identityMap = new Map<number, number>();
  for (const id of nodeIdMapping.keys()) identityMap.set(id, id);
  const closed = remapClosedForNodeIdMap(relations, groups, identityMap);
  const closedRelations = closed.relations ?? [];
  const closedGroups = closed.groups ?? [];
  const idMap = new Map(nodeIdMapping);
  const entityCount = closedRelations.length + closedGroups.length;
  if (entityCount > 0) {
    const newIds = allocateEntityIds(occupied, entityCount);
    let index = 0;
    for (const relation of closedRelations) {
      idMap.set(relation.id, newIds[index]!);
      index += 1;
    }
    for (const group of closedGroups) {
      idMap.set(group.id, newIds[index]!);
      index += 1;
    }
  }
  return remapClosedForNodeIdMap(relations, groups, idMap);
}

export function mergeRelationGroupSlices(
  base: Pick<NodeMapState, "relations" | "groups">,
  added: RelationGroupSlice,
): RelationGroupSlice {
  const relations = [...(base.relations ?? []), ...(added.relations ?? [])];
  const groups = [...(base.groups ?? []), ...(added.groups ?? [])];
  return toSlice(relations, groups);
}
