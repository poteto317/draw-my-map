import {
  applyBranchPlacement,
  calculateIndentTranslation,
} from "@/domain/nodes/nodeIndentPlacement";
import { createParentNode } from "@/domain/nodes/nodePlacement";
import { indexFirstNodes } from "@/domain/nodes/nodeTree";
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

type InsertionTargetResolution =
  | { ok: true; target: Node }
  | { ok: false; reason: NodeParentInsertionFailureReason };

// 挿入先の T を引き、T と新しい ID が挿入できる状態かを確かめる（配列は変えない）
function resolveInsertionTarget(
  nodes: readonly Node[],
  nodeId: number,
  newNodeId: number,
  visibleNodeIds: ReadonlySet<number>,
): InsertionTargetResolution {
  const nodesById = indexFirstNodes(nodes);
  const target = nodesById.get(nodeId);
  if (target === undefined) return { ok: false, reason: "node-missing" };
  if (!visibleNodeIds.has(target.id)) return { ok: false, reason: "node-hidden" };
  if (
    target.parentId === target.id ||
    (target.parentId !== null && !nodesById.has(target.parentId))
  ) {
    return { ok: false, reason: "invalid-structure" };
  }
  if (nodesById.has(newNodeId)) return { ok: false, reason: "id-conflict" };
  return { ok: true, target };
}

// 段階1: 新しい親 N を T の直前に積む（T はまだ元の親の子のまま）
function stageParentBeforeTarget(nodes: readonly Node[], target: Node, parent: Node): Node[] {
  const staged: Node[] = [];
  for (const node of nodes) {
    if (node === target) staged.push(parent, node);
    else staged.push(node);
  }
  return staged;
}

// 段階2: T の親を N に付け替える。T 以外は同じオブジェクトのまま積む
function reparentTarget(staged: readonly Node[], target: Node, parentId: number): Node[] {
  const reparented: Node[] = [];
  for (const node of staged) {
    reparented.push(node === target ? { ...target, parentId } : node);
  }
  return reparented;
}

export function insertParentNode(
  nodes: readonly Node[],
  nodeId: number,
  newNodeId: number,
  visibleNodeIds: ReadonlySet<number>,
  mode: NodeLayoutMode,
): NodeParentInsertionResult {
  const resolved = resolveInsertionTarget(nodes, nodeId, newNodeId, visibleNodeIds);
  if (!resolved.ok) return resolved;
  const { target } = resolved;

  const staged = stageParentBeforeTarget(nodes, target, createParentNode(target, newNodeId));
  // 座標は staged で求める。N に子が無い状態で計算する。T が N の子になった後の配列で呼ぶと、
  // T 自身の下端の 40 下に置いてしまう
  const placed = applyBranchPlacement(
    reparentTarget(staged, target, newNodeId),
    target.id,
    mode,
    () => calculateIndentTranslation(staged, target.id, newNodeId),
  );
  if (placed === null) return { ok: false, reason: "placement-failed" };
  return { ok: true, nodes: placed, insertedId: newNodeId };
}
