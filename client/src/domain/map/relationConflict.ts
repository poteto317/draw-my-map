import type { MapRelation } from "@/types/mapRelation";

function sameUnorderedPair(aFrom: number, aTo: number, bFrom: number, bTo: number): boolean {
  return Math.min(aFrom, aTo) === Math.min(bFrom, bTo) && Math.max(aFrom, aTo) === Math.max(bFrom, bTo);
}

// 無向は端点正規化キー。有向は向き付き。無向↔有向の混在衝突は canCommitRelation / dedupe 側で見る
export function relationConflictKey(r: Pick<MapRelation, "fromId" | "toId" | "directed">): string {
  if (!r.directed) {
    const lo = Math.min(r.fromId, r.toId);
    const hi = Math.max(r.fromId, r.toId);
    return `u:${lo}:${hi}`;
  }
  return `d:${r.fromId}:${r.toId}`;
}

export function relationsConflict(
  a: Pick<MapRelation, "fromId" | "toId" | "directed">,
  b: Pick<MapRelation, "fromId" | "toId" | "directed">,
): boolean {
  if (!sameUnorderedPair(a.fromId, a.toId, b.fromId, b.toId)) return false;
  if (!a.directed || !b.directed) return true;
  return a.fromId === b.fromId && a.toId === b.toId;
}

export function canCommitRelation(
  relations: readonly MapRelation[] | undefined,
  draft: MapRelation,
  ignoreId?: number,
): boolean {
  if (draft.fromId === draft.toId) return false;
  for (const existing of relations ?? []) {
    if (ignoreId !== undefined && existing.id === ignoreId) continue;
    if (relationsConflict(existing, draft)) return false;
  }
  return true;
}

export function dedupeRelationsByConflict(relations: readonly MapRelation[]): MapRelation[] {
  const kept: MapRelation[] = [];
  const sorted = [...relations].sort((a, b) => a.id - b.id);
  for (const candidate of sorted) {
    if (kept.some((existing) => relationsConflict(existing, candidate))) continue;
    kept.push(candidate);
  }
  return kept;
}
