import {
  calculateIndentTranslation,
  translateBranch,
} from "@/domain/nodes/nodeIndentPlacement";
import { createParentNode } from "@/domain/nodes/nodePlacement";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";

export type NodeParentInsertionFailureReason =
  | "node-missing"
  | "node-hidden"
  | "invalid-structure"
  | "id-conflict"
  | "placement-failed";

export type NodeParentInsertionResult =
  | { ok: true; nodes: Node[]; insertedId: number }
  | { ok: false; reason: NodeParentInsertionFailureReason };

// useNodes.insertParentNode の戻り値
export type InsertParentNodeResult =
  | { ok: true; insertedId: number }
  | { ok: false; reason: NodeParentInsertionFailureReason };

export function canInsertParentNode(
  nodes: readonly Node[],
  nodeId: number | null,
  visibleNodeIds: ReadonlySet<number>,
): boolean {
  if (nodeId === null) return false;
  if (!visibleNodeIds.has(nodeId)) return false;
  for (const node of nodes) {
    if (node.id === nodeId) return true;
  }
  return false;
}

export function insertParentNode(
  nodes: readonly Node[],
  nodeId: number,
  newNodeId: number,
  visibleNodeIds: ReadonlySet<number>,
  mode: NodeLayoutMode,
): NodeParentInsertionResult {
  const byId = new Map<number, Node>();
  for (const node of nodes) {
    if (!byId.has(node.id)) byId.set(node.id, node);
  }
  const target = byId.get(nodeId);
  if (target === undefined) return { ok: false, reason: "node-missing" };
  if (!visibleNodeIds.has(target.id)) return { ok: false, reason: "node-hidden" };
  if (
    target.parentId === target.id ||
    (target.parentId !== null && !byId.has(target.parentId))
  ) {
    return { ok: false, reason: "invalid-structure" };
  }
  if (byId.has(newNodeId)) return { ok: false, reason: "id-conflict" };

  const parent = createParentNode(target, newNodeId);

  // 段階1: 新しい親 N を T の直前に積む（T はまだ元の親の子のまま）
  const staged: Node[] = [];
  for (const node of nodes) {
    if (node === target) staged.push(parent, node);
    else staged.push(node);
  }

  // 座標は staged で求める。N に子が無い状態で計算する。T が N の子になった後の配列で呼ぶと、
  // T 自身の下端の 40 下に置いてしまう
  let translation: ReturnType<typeof calculateIndentTranslation> = null;
  switch (mode) {
    case "manual": {
      translation = calculateIndentTranslation(staged, target.id, newNodeId);
      if (translation === null) return { ok: false, reason: "placement-failed" };
      break;
    }
    case "auto":
      break;
    default: {
      const unreachable: never = mode;
      return unreachable;
    }
  }

  // 段階2: T の親を N に付け替える
  const reparented: Node[] = [];
  for (const node of staged) {
    reparented.push(node === target ? { ...target, parentId: newNodeId } : node);
  }

  let placed: Node[] | null = reparented;
  if (translation !== null) {
    placed = translateBranch(reparented, target.id, translation);
    if (placed === null) return { ok: false, reason: "placement-failed" };
  }
  return { ok: true, nodes: placed, insertedId: newNodeId };
}
