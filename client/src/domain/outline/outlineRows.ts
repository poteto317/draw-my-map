import type { Node } from "@/types/node";

export type OutlineRow = { nodeId: number; depth: number };

export type OutlineRows = {
  rows: readonly OutlineRow[];
  nodesById: ReadonlyMap<number, Node>;
  allNodeIds: ReadonlySet<number>;
  invalidStructure: boolean;
  duplicateIds: boolean;
};

export function buildOutlineRows(nodes: readonly Node[]): OutlineRows {
  const nodesById = new Map<number, Node>();
  const childrenById = new Map<number, number[]>();
  const rootIds: number[] = [];
  let duplicateIds = false;
  for (const node of nodes) {
    if (nodesById.has(node.id)) {
      duplicateIds = true;
      continue;
    }
    nodesById.set(node.id, node);
    if (node.parentId === null) {
      rootIds.push(node.id);
    } else {
      const children = childrenById.get(node.parentId) ?? [];
      children.push(node.id);
      childrenById.set(node.parentId, children);
    }
  }

  const rows: OutlineRow[] = [];
  const visited = new Set<number>();
  const stack: OutlineRow[] = rootIds.reverse().map((nodeId) => ({ nodeId, depth: 1 }));
  while (stack.length > 0) {
    const row = stack.pop()!;
    if (visited.has(row.nodeId)) continue;
    visited.add(row.nodeId);
    rows.push(row);
    const children = childrenById.get(row.nodeId) ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ nodeId: children[index], depth: row.depth + 1 });
    }
  }

  let invalidStructure = duplicateIds;
  // 根から届かないノードは、子をたどり直さず正本配列の順に表示する。
  // 親不在・自己参照・循環はいずれもこの集合に含まれる。
  for (const node of nodesById.values()) {
    if (visited.has(node.id)) continue;
    invalidStructure = true;
    rows.push({ nodeId: node.id, depth: 1 });
  }

  return { rows, nodesById, allNodeIds: new Set(nodesById.keys()), invalidStructure, duplicateIds };
}
