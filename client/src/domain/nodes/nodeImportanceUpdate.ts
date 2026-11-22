import { assertNodesEditable } from "@/domain/nodes/nodeEditLock";
import type { Node } from "@/types/node";
import type { NodeImportance } from "@/types/nodeImportance";

export function replaceNodeImportance(
  nodes: readonly Node[],
  id: number,
  importance: NodeImportance,
): Node[] | null {
  if (!nodes.some((node) => node.id === id)) return null;
  if (!assertNodesEditable([id], nodes).ok) return null;

  return nodes.map((node) => (
    node.id === id ? { ...node, importance } : node
  ));
}

// 指定IDのうち存在するノードだけを置き換える。存在するIDが1件も無ければ何も変えずnullを返す
// （空の指定を「全件」や「成功」と扱わない）。すでに同じ重要度のノードは参照を保つ
export function replaceNodesImportance(
  nodes: readonly Node[],
  ids: readonly number[],
  importance: NodeImportance,
): Node[] | null {
  const targetIds = new Set(ids);
  const existingTargetIds = [...targetIds].filter((id) => nodes.some((node) => node.id === id));
  if (existingTargetIds.length === 0) return null;
  if (!assertNodesEditable(existingTargetIds, nodes).ok) return null;

  return nodes.map((node) => (
    targetIds.has(node.id) && node.importance !== importance
      ? { ...node, importance }
      : node
  ));
}
