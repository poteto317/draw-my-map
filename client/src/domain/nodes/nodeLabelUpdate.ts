import type { Node } from "@/types/node";

// 現在のノードに存在する ID だけ新しいラベルへ置き換える。1 件も存在しなければ何も変えずに null（空を全件や成功と扱わない）。
// すでに同じラベルのノードは参照を保つ
export function replaceNodeLabels(
  nodes: readonly Node[],
  replacements: ReadonlyMap<number, string>,
): Node[] | null {
  if (!nodes.some((node) => replacements.has(node.id))) return null;

  return nodes.map((node) => {
    const label = replacements.get(node.id);
    return label === undefined || label === node.label ? node : { ...node, label };
  });
}
