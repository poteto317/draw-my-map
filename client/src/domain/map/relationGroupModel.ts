import { isRecord } from "@/domain/shared/unknownRecord";
import { dedupeRelationsByConflict } from "@/domain/map/relationConflict";
import { MAP_GROUP_LABEL_MAX_CODEPOINTS, type MapGroup } from "@/types/mapGroup";
import { RELATION_KINDS, type MapRelation, type RelationKind } from "@/types/mapRelation";
import type { NodeMapState } from "@/types/nodeMapState";

const RELATION_KIND_SET = new Set<string>(RELATION_KINDS);

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function isRelationKind(value: unknown): value is RelationKind {
  return typeof value === "string" && RELATION_KIND_SET.has(value);
}

function parseRelation(raw: unknown, nodeIdSet: ReadonlySet<number>): MapRelation | null {
  if (!isRecord(raw)) return null;
  const { id, fromId, toId, kind, directed } = raw;
  if (!isPositiveSafeInteger(id) || !isPositiveSafeInteger(fromId) || !isPositiveSafeInteger(toId)) {
    return null;
  }
  if (fromId === toId) return null;
  if (!nodeIdSet.has(fromId) || !nodeIdSet.has(toId)) return null;
  if (!isRelationKind(kind)) return null;
  if (typeof directed !== "boolean") return null;
  return { id, fromId, toId, kind, directed };
}

export function normalizeRelations(
  raw: unknown,
  nodeIdSet: ReadonlySet<number>,
): readonly MapRelation[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const parsed: MapRelation[] = [];
  const seenIds = new Set<number>();
  for (const entry of raw) {
    const relation = parseRelation(entry, nodeIdSet);
    if (relation === null) continue;
    // 共有 ID 空間: ノード id と衝突、または同一配列内の重複 id は除去（先勝ち）
    if (nodeIdSet.has(relation.id) || seenIds.has(relation.id)) continue;
    seenIds.add(relation.id);
    parsed.push(relation);
  }
  const deduped = dedupeRelationsByConflict(parsed);
  return deduped.length === 0 ? undefined : deduped;
}

function parseGroup(raw: unknown, nodeIdSet: ReadonlySet<number>): MapGroup | null {
  if (!isRecord(raw)) return null;
  const { id, nodeIds, label } = raw;
  if (!isPositiveSafeInteger(id)) return null;
  if (typeof label !== "string") return null;
  if (Array.from(label).length > MAP_GROUP_LABEL_MAX_CODEPOINTS) return null;
  if (!Array.isArray(nodeIds)) return null;

  const unique: number[] = [];
  const seen = new Set<number>();
  for (const candidate of nodeIds) {
    if (!isPositiveSafeInteger(candidate)) return null;
    if (!nodeIdSet.has(candidate)) continue;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    unique.push(candidate);
  }
  if (unique.length < 2) return null;
  return { id, nodeIds: unique, label };
}

export function normalizeGroups(
  raw: unknown,
  nodeIdSet: ReadonlySet<number>,
  // ノード＋既に採番済みの relation 等。衝突する group は除去
  reservedEntityIds: ReadonlySet<number> = nodeIdSet,
): readonly MapGroup[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const parsed: MapGroup[] = [];
  const seenIds = new Set<number>();
  for (const entry of raw) {
    const group = parseGroup(entry, nodeIdSet);
    if (group === null) continue;
    if (reservedEntityIds.has(group.id) || seenIds.has(group.id)) continue;
    seenIds.add(group.id);
    parsed.push(group);
  }
  return parsed.length === 0 ? undefined : parsed;
}

export function collectUsedEntityIds(
  state: Pick<NodeMapState, "nodes" | "relations" | "groups">,
): number[] {
  const ids: number[] = state.nodes.map((node) => node.id);
  for (const relation of state.relations ?? []) ids.push(relation.id);
  for (const group of state.groups ?? []) ids.push(group.id);
  return ids;
}

function relationFieldsEqual(relation: MapRelation, other: MapRelation): boolean {
  return (
    relation.id === other.id
    && relation.fromId === other.fromId
    && relation.toId === other.toId
    && relation.kind === other.kind
    && relation.directed === other.directed
  );
}

function groupFieldsEqual(group: MapGroup, other: MapGroup): boolean {
  return (
    group.id === other.id
    && group.label === other.label
    && group.nodeIds.length === other.nodeIds.length
    && group.nodeIds.every((id, nodeIndex) => id === other.nodeIds[nodeIndex])
  );
}

// 配列順は問わない（履歴・競合とも id 昇順で内容比較。未定義と空は等価）
export function areRelationsEqual(
  a: readonly MapRelation[] | undefined,
  b: readonly MapRelation[] | undefined,
): boolean {
  const left = [...(a ?? [])].sort((x, y) => x.id - y.id);
  const right = [...(b ?? [])].sort((x, y) => x.id - y.id);
  if (left.length !== right.length) return false;
  return left.every((relation, index) => relationFieldsEqual(relation, right[index]!));
}

export function areGroupsEqual(
  a: readonly MapGroup[] | undefined,
  b: readonly MapGroup[] | undefined,
): boolean {
  const left = [...(a ?? [])].sort((x, y) => x.id - y.id);
  const right = [...(b ?? [])].sort((x, y) => x.id - y.id);
  if (left.length !== right.length) return false;
  return left.every((group, index) => groupFieldsEqual(group, right[index]!));
}

export function projectRelations(
  relations: readonly MapRelation[] | undefined,
): { relations?: readonly MapRelation[] } {
  return relations === undefined || relations.length === 0 ? {} : { relations };
}

export function projectGroups(
  groups: readonly MapGroup[] | undefined,
): { groups?: readonly MapGroup[] } {
  return groups === undefined || groups.length === 0 ? {} : { groups };
}
