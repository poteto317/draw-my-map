import type { BranchLayout } from "@/types/branchLayout";

function toOptional(layouts: readonly BranchLayout[]): readonly BranchLayout[] | undefined {
  return layouts.length === 0 ? undefined : layouts;
}

export function pruneBranchLayoutsAfterRemovedNodeIds(
  layouts: readonly BranchLayout[] | undefined,
  removedIds: readonly number[],
): readonly BranchLayout[] | undefined {
  if (layouts === undefined || layouts.length === 0) return undefined;
  const removed = new Set(removedIds);
  return toOptional(layouts.filter((entry) => !removed.has(entry.nodeId)));
}

// 移動集合に閉じたエントリだけを idMap で写す（境界は捨てる）
export function remapClosedBranchLayouts(
  layouts: readonly BranchLayout[] | undefined,
  idMap: ReadonlyMap<number, number>,
): readonly BranchLayout[] | undefined {
  if (layouts === undefined || layouts.length === 0) return undefined;
  const next: BranchLayout[] = [];
  for (const entry of layouts) {
    if (!idMap.has(entry.nodeId)) continue;
    next.push({ nodeId: idMap.get(entry.nodeId)!, direction: entry.direction });
  }
  return toOptional(next);
}

// 吸収 ID → survivor。survivor に既存があれば吸収側を捨てる（配列順に依らず survivor 優先）
export function rewriteBranchLayoutsAfterNodeMerge(
  survivorId: number,
  absorbedIds: readonly number[],
  layouts: readonly BranchLayout[] | undefined,
): readonly BranchLayout[] | undefined {
  if (layouts === undefined || layouts.length === 0) return undefined;
  const absorbed = new Set(absorbedIds);
  const survivorEntry = layouts.find((entry) => entry.nodeId === survivorId);
  const next: BranchLayout[] = [];
  const seen = new Set<number>();
  for (const entry of layouts) {
    if (entry.nodeId === survivorId) {
      if (seen.has(survivorId)) continue;
      seen.add(survivorId);
      next.push(entry);
      continue;
    }
    if (absorbed.has(entry.nodeId)) {
      if (survivorEntry !== undefined) continue;
      if (seen.has(survivorId)) continue;
      seen.add(survivorId);
      next.push({ nodeId: survivorId, direction: entry.direction });
      continue;
    }
    if (seen.has(entry.nodeId)) continue;
    seen.add(entry.nodeId);
    next.push(entry);
  }
  return toOptional(next);
}

/** nodeId 重複は先勝ち（normalizeBranchLayouts と同型）。 */
export function appendBranchLayouts(
  base: readonly BranchLayout[] | undefined,
  added: readonly BranchLayout[] | undefined,
): readonly BranchLayout[] | undefined {
  const next: BranchLayout[] = [];
  const seen = new Set<number>();
  for (const entry of [...(base ?? []), ...(added ?? [])]) {
    if (seen.has(entry.nodeId)) continue;
    seen.add(entry.nodeId);
    next.push(entry);
  }
  return toOptional(next);
}
