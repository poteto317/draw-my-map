import { indexNodeForest } from "@/domain/nodes/nodeLayoutForest";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";

export type NodeOnlyDeletionFailureReason =
  | "node-missing"
  | "node-hidden"
  | "invalid-structure"
  | "placement-failed";

export type DeleteNodeOnlyResult =
  | { ok: true; deletedId: number }
  | { ok: false; reason: NodeOnlyDeletionFailureReason };

export type NodeOnlyDeletionResult =
  | { ok: true; nodes: Node[]; deletedId: number }
  | { ok: false; reason: NodeOnlyDeletionFailureReason };

export function canDeleteNodeOnly(
  nodes: readonly Node[],
  nodeId: number | null,
  visibleNodeIds: ReadonlySet<number>,
): boolean {
  return nodeId !== null && visibleNodeIds.has(nodeId) && nodes.some((node) => node.id === nodeId);
}

export function deleteNodeOnly(
  nodes: readonly Node[],
  nodeId: number,
  visibleNodeIds: ReadonlySet<number>,
  mode: NodeLayoutMode,
): NodeOnlyDeletionResult {
  const target = nodes.find((node) => node.id === nodeId);
  if (!target) return { ok: false, reason: "node-missing" };
  if (!visibleNodeIds.has(nodeId)) return { ok: false, reason: "node-hidden" };
  // 配置不能と構造不正を分類するため、geometryだけを森の検証より先に調べる。
  if (nodes.some((node) => (
    !Number.isFinite(node.x) || !Number.isFinite(node.y) ||
    !Number.isFinite(node.width) || !Number.isFinite(node.height) ||
    node.width <= 0 || node.height <= 0
  ))) return { ok: false, reason: "placement-failed" };
  if (!indexNodeForest(nodes)) return { ok: false, reason: "invalid-structure" };

  const children = nodes.filter((node) => node.parentId === nodeId)
    .map((node) => ({ ...node, parentId: target.parentId }));
  const next: Node[] = [];
  // 配列順が兄弟順の正本。子がTより前にあってもTの位置へ一度だけ挿入する。
  for (const node of nodes) {
    if (node.id === nodeId) {
      for (const child of children) next.push(child);
    } else if (node.parentId !== nodeId) next.push(node);
  }
  if (mode === "auto") {
    const previousRoot = nodes.find((node) => node.parentId === null);
    const nextRootIndex = next.findIndex((node) => node.parentId === null);
    if (previousRoot && nextRootIndex !== -1 && next[nextRootIndex].id !== previousRoot.id) {
      next[nextRootIndex] = { ...next[nextRootIndex], x: previousRoot.x, y: previousRoot.y };
    }
  }
  return { ok: true, nodes: next, deletedId: nodeId };
}
