import { assertNodesEditable } from "@/domain/nodes/nodeEditLock";
import { fitNodeHeightToLabel } from "@/domain/nodes/nodeLabelLayout";
import type { Node } from "@/types/node";

// 現在のノードに存在する ID だけ新しいラベルへ置き換える。1 件も存在しなければ何も変えずに null（空を全件や成功と扱わない）。
// すでに同じラベルのノードは参照を保つ。ラベルが変わったノードだけ commit fit する
export function replaceNodeLabels(
  nodes: readonly Node[],
  replacements: ReadonlyMap<number, string>,
): Node[] | null {
  const existingTargetIds = [...replacements.keys()].filter((id) => nodes.some((node) => node.id === id));
  if (existingTargetIds.length === 0) return null;
  if (!assertNodesEditable(existingTargetIds, nodes).ok) return null;

  return nodes.map((node) => {
    const label = replacements.get(node.id);
    if (label === undefined || label === node.label) return node;
    return fitNodeHeightToLabel({ ...node, label }, "commit");
  });
}

/** 単一ノードのラベル更新 + commit fit。対象不在・locked は null */
export function updateNodeLabel(
  nodes: readonly Node[],
  id: number,
  label: string,
): Node[] | null {
  return replaceNodeLabels(nodes, new Map([[id, label]]));
}
