import {
  layoutNodeForest,
  type LayoutNodeForestOptions,
} from "@/domain/nodes/nodeAutoLayout";
import { assertNodesEditable } from "@/domain/nodes/nodeEditLock";
import { buildNodeForestRelations } from "@/domain/nodes/nodeLayoutForestRelations";
import { collectSubtreeIds } from "@/domain/nodes/nodeTree";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";

export type ReorderAllSiblingsFailureReason =
  | "invalid-structure"
  | "parent-missing"
  | "invalid-order"
  | "locked"
  | "placement-failed"
  | "unchanged";

export type ReorderAllSiblingsResult =
  | { ok: true; nodes: Node[] }
  | { ok: false; reason: ReorderAllSiblingsFailureReason };

export function directChildIdsInArrayOrder(nodes: readonly Node[], parentId: number): number[] {
  const seen = new Set<number>();
  const ids: number[] = [];
  for (const node of nodes) {
    if (node.parentId !== parentId || seen.has(node.id)) continue;
    seen.add(node.id);
    ids.push(node.id);
  }
  return ids;
}

function sameIdMultiset(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const counts = new Map<number, number>();
  for (const id of a) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const id of b) {
    const next = (counts.get(id) ?? 0) - 1;
    if (next < 0) return false;
    if (next === 0) counts.delete(id);
    else counts.set(id, next);
  }
  return counts.size === 0;
}

export function reorderAllSiblings(
  nodes: readonly Node[],
  parentId: number,
  childIds: readonly number[],
  mode: NodeLayoutMode,
  layoutOptions: LayoutNodeForestOptions,
): ReorderAllSiblingsResult {
  if (buildNodeForestRelations(nodes) === null) return { ok: false, reason: "invalid-structure" };
  if (!nodes.some((node) => node.id === parentId)) return { ok: false, reason: "parent-missing" };

  const current = directChildIdsInArrayOrder(nodes, parentId);
  if (!sameIdMultiset(current, childIds)) return { ok: false, reason: "invalid-order" };

  const lockedCheck = assertNodesEditable([parentId, ...childIds], nodes);
  if (!lockedCheck.ok && lockedCheck.reason === "locked") return { ok: false, reason: "locked" };
  if (current.every((id, index) => id === childIds[index])) {
    return { ok: false, reason: "unchanged" };
  }

  const subtreeIds = new Set<number>();
  for (const childId of current) {
    for (const id of collectSubtreeIds(nodes, childId)) subtreeIds.add(id);
  }

  let insertAt = nodes.length;
  for (let index = 0; index < nodes.length; index += 1) {
    if (subtreeIds.has(nodes[index]!.id)) {
      insertAt = index;
      break;
    }
  }

  const before = nodes.slice(0, insertAt).filter((node) => !subtreeIds.has(node.id));
  const after = nodes.slice(insertAt).filter((node) => !subtreeIds.has(node.id));
  const blocks = childIds.flatMap((childId) => {
    const ids = collectSubtreeIds(nodes, childId);
    return nodes.filter((node) => ids.has(node.id));
  });
  const reordered = [...before, ...blocks, ...after];

  if (mode === "auto") {
    const laid = layoutNodeForest(reordered, layoutOptions);
    if (laid === null) return { ok: false, reason: "placement-failed" };
    return { ok: true, nodes: laid };
  }
  return { ok: true, nodes: reordered };
}