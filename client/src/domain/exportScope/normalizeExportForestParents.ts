import type { Node } from "@/types/node";

/** 部分集合書き出し用に、集合外の親を持つノードを根（parentId=null）へ正規化する。 */
export function normalizeExportForestParents(nodes: readonly Node[]): Node[] {
  const ids = new Set(nodes.map((node) => node.id));
  return nodes.map((node) =>
    node.parentId !== null && !ids.has(node.parentId)
      ? { ...node, parentId: null }
      : node,
  );
}
