import { assertNodesEditable } from "@/domain/nodes/nodeEditLock";
import type { BranchLayout, BranchLayoutDirection } from "@/types/branchLayout";
import type { Node } from "@/types/node";
import type { TreeDirection } from "@/types/treeDirection";

export function effectiveBranchDirection(
  nodeId: number,
  branchLayouts: readonly BranchLayout[] | undefined,
  documentDirection: TreeDirection,
  parentById: ReadonlyMap<number, number | null>,
): BranchLayoutDirection {
  if (branchLayouts !== undefined && branchLayouts.length > 0) {
    const byId = new Map(branchLayouts.map((entry) => [entry.nodeId, entry.direction]));
    let current: number | null = nodeId;
    while (current !== null) {
      const found = byId.get(current);
      if (found !== undefined) return found;
      current = parentById.has(current) ? parentById.get(current)! : null;
    }
  }
  return documentDirection;
}

export type SetBranchLayoutResult =
  | { ok: true; branchLayouts: readonly BranchLayout[] | undefined }
  | { ok: false; reason: "locked" | "node-missing" | "unchanged" };

/** branchLayouts の設定／削除（null＝エントリ削除）。locked は拒否。 */
export function applySetBranchLayout(
  nodes: readonly Node[],
  current: readonly BranchLayout[] | undefined,
  nodeId: number,
  direction: BranchLayoutDirection | null,
): SetBranchLayoutResult {
  const target = nodes.find((node) => node.id === nodeId);
  if (target === undefined) return { ok: false, reason: "node-missing" };
  if (!assertNodesEditable([nodeId], nodes).ok) return { ok: false, reason: "locked" };

  const existing = current ?? [];
  if (direction === null) {
    if (!existing.some((entry) => entry.nodeId === nodeId)) {
      return { ok: false, reason: "unchanged" };
    }
    const next = existing.filter((entry) => entry.nodeId !== nodeId);
    return { ok: true, branchLayouts: next.length === 0 ? undefined : next };
  }

  const index = existing.findIndex((entry) => entry.nodeId === nodeId);
  if (index >= 0 && existing[index]!.direction === direction) {
    return { ok: false, reason: "unchanged" };
  }
  const next = existing.filter((entry) => entry.nodeId !== nodeId);
  next.push({ nodeId, direction });
  next.sort((a, b) => a.nodeId - b.nodeId);
  return { ok: true, branchLayouts: next };
}

export function buildParentById(nodes: readonly Node[]): ReadonlyMap<number, number | null> {
  return new Map(nodes.map((node) => [node.id, node.parentId]));
}

export function buildDirectionById(
  nodes: readonly Node[],
  branchLayouts: readonly BranchLayout[] | undefined,
  documentDirection: TreeDirection,
): ReadonlyMap<number, BranchLayoutDirection> {
  const parents = buildParentById(nodes);
  const map = new Map<number, BranchLayoutDirection>();
  for (const node of nodes) {
    map.set(
      node.id,
      effectiveBranchDirection(node.id, branchLayouts, documentDirection, parents),
    );
  }
  return map;
}
