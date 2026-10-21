import { indexNodeForest } from "./nodeLayoutForest";
import type { Node } from "@/types/node";

export type NodeCollapseIndex = {
  nodesById: ReadonlyMap<number, Node>;
  parentById: ReadonlyMap<number, number | null>;
  childrenByParent: ReadonlyMap<number, readonly Node[]>;
  descendantCountById: ReadonlyMap<number, number>;
  roots: readonly Node[];
};

type DerivedNodeCollapse = {
  collapsedNodeIds: ReadonlySet<number>;
  visibleNodeIds: ReadonlySet<number>;
  hiddenCountById: ReadonlyMap<number, number>;
};

export function createNodeCollapseIndex(
  nodes: readonly Node[],
): NodeCollapseIndex | null {
  const forest = indexNodeForest(nodes);
  if (!forest) return null;

  const nodesById = new Map<number, Node>();
  const parentById = new Map<number, number | null>();
  for (const node of nodes) {
    nodesById.set(node.id, node);
    parentById.set(node.id, node.parentId);
  }

  const descendantCountById = new Map<number, number>();
  for (const node of forest.postOrder) {
    let count = 0;
    for (const child of forest.childrenByParent.get(node.id) ?? []) {
      count += 1 + (descendantCountById.get(child.id) ?? 0);
    }
    descendantCountById.set(node.id, count);
  }

  return {
    nodesById,
    parentById,
    childrenByParent: forest.childrenByParent,
    descendantCountById,
    roots: forest.roots,
  };
}

type CollapseEligibilityIndex = Pick<NodeCollapseIndex, "descendantCountById">;

/** 子を持つ実在ノードだけを折りたたみ対象にできる。 */
export function canCollapse(index: CollapseEligibilityIndex, nodeId: number): boolean {
  return (index.descendantCountById.get(nodeId) ?? 0) > 0;
}

/** 不在IDと葉を除いた閉ID集合を返す。すべて有効なら入力の参照をそのまま返す。 */
export function normalizeCollapsedNodeIds(
  index: CollapseEligibilityIndex,
  collapsedIds: ReadonlySet<number>,
): ReadonlySet<number> {
  const validIds: number[] = [];
  for (const nodeId of collapsedIds) {
    if (canCollapse(index, nodeId)) validIds.push(nodeId);
  }
  return validIds.length === collapsedIds.size ? collapsedIds : new Set(validIds);
}

export function deriveNodeCollapse(
  index: NodeCollapseIndex,
  collapsedIds: ReadonlySet<number>,
): DerivedNodeCollapse {
  const collapsedNodeIds = normalizeCollapsedNodeIds(index, collapsedIds);
  const hiddenCountById = new Map<number, number>();
  for (const nodeId of collapsedNodeIds) {
    hiddenCountById.set(nodeId, index.descendantCountById.get(nodeId)!);
  }

  const hiddenNodeIds = new Set<number>();
  const stack: Array<{ node: Node; ancestorCollapsed: boolean }> = index.roots
    .map((node) => ({ node, ancestorCollapsed: false }))
    .reverse();
  while (stack.length > 0) {
    const { node, ancestorCollapsed } = stack.pop()!;
    if (ancestorCollapsed) hiddenNodeIds.add(node.id);
    const descendantsHidden = ancestorCollapsed || collapsedNodeIds.has(node.id);
    const children = index.childrenByParent.get(node.id) ?? [];
    for (let childIndex = children.length - 1; childIndex >= 0; childIndex -= 1) {
      stack.push({ node: children[childIndex], ancestorCollapsed: descendantsHidden });
    }
  }

  const visibleNodeIds = new Set<number>();
  for (const node of index.nodesById.values()) {
    if (!hiddenNodeIds.has(node.id)) visibleNodeIds.add(node.id);
  }
  return { collapsedNodeIds, visibleNodeIds, hiddenCountById };
}

export function collectAncestorIds(
  index: NodeCollapseIndex,
  nodeId: number,
): readonly number[] | null {
  if (!index.nodesById.has(nodeId)) return null;
  const ancestors: number[] = [];
  let parentId = index.parentById.get(nodeId) ?? null;
  while (parentId !== null) {
    ancestors.push(parentId);
    parentId = index.parentById.get(parentId) ?? null;
  }
  return ancestors;
}

export function toggleCollapsedNode(
  index: NodeCollapseIndex,
  current: ReadonlySet<number>,
  nodeId: number,
): ReadonlySet<number> {
  if (!canCollapse(index, nodeId)) return current;
  const next = new Set(current);
  if (next.has(nodeId)) next.delete(nodeId);
  else next.add(nodeId);
  return next;
}

export function expandCollapsedNodes(
  current: ReadonlySet<number>,
  nodeIds: readonly number[],
): ReadonlySet<number> {
  let next: Set<number> | null = null;
  for (const nodeId of nodeIds) {
    if (!current.has(nodeId)) continue;
    next ??= new Set(current);
    next.delete(nodeId);
  }
  return next ?? current;
}
