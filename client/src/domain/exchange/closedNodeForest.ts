import type { Node } from "@/types/node";

function indexOrder(nodes: readonly Node[]): Map<number, number> {
  return new Map(nodes.map((node, index) => [node.id, index]));
}

/** 部分集合内で親を欠くノードをルートとみなし、配列順でソートする。 */
export function forestRootNodes(nodes: readonly Node[]): Node[] {
  const ids = new Set(nodes.map((node) => node.id));
  const order = indexOrder(nodes);
  return nodes
    .filter((node) => node.parentId === null || !ids.has(node.parentId))
    .sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}

export function sortedChildNodes(parentId: number, nodes: readonly Node[]): Node[] {
  const order = indexOrder(nodes);
  return nodes
    .filter((node) => node.parentId === parentId)
    .sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}

/** 閉じた部分森をルート→深さ優先の配列順に並べる（CSV 書き出し用）。 */
export function preOrderClosedForest(nodes: readonly Node[]): Node[] {
  const out: Node[] = [];
  const stack: Node[] = [];
  const roots = forestRootNodes(nodes);
  for (let index = roots.length - 1; index >= 0; index -= 1) {
    stack.push(roots[index]!);
  }
  while (stack.length > 0) {
    const node = stack.pop()!;
    out.push(node);
    const children = sortedChildNodes(node.id, nodes);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]!);
    }
  }
  return out;
}