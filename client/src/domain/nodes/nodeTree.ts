import type { Node } from "@/types/node";

// 根は配列に無くても含める。親子関係が循環した不正な配列でも各ノードを一度だけ訪れて停止する
export function collectSubtreeIds(nodes: readonly Node[], rootId: number): Set<number> {
  const childIdsByParentId = new Map<number, number[]>();
  for (const node of nodes) {
    if (node.parentId === null) continue;
    const childIds = childIdsByParentId.get(node.parentId);
    if (childIds) childIds.push(node.id);
    else childIdsByParentId.set(node.parentId, [node.id]);
  }

  const ids = new Set<number>([rootId]);
  const queue = [rootId];
  for (let index = 0; index < queue.length; index += 1) {
    for (const childId of childIdsByParentId.get(queue[index]) ?? []) {
      if (ids.has(childId)) continue;
      ids.add(childId);
      queue.push(childId);
    }
  }

  return ids;
}

function hasAncestorOrCycle(
  nodesById: ReadonlyMap<number, Node>,
  nodeId: number,
  ancestorId: number,
): boolean {
  const visitedIds = new Set<number>();
  let currentId: number | null = nodeId;

  while (currentId !== null) {
    if (currentId === ancestorId) return true;
    if (visitedIds.has(currentId)) return true;
    visitedIds.add(currentId);
    currentId = nodesById.get(currentId)?.parentId ?? null;
  }

  return false;
}

export function canConnectNodes(
  nodes: readonly Node[],
  parentId: number,
  childId: number,
): boolean {
  if (parentId === childId) return false;

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  if (!nodesById.has(parentId) || !nodesById.has(childId)) return false;

  return !hasAncestorOrCycle(nodesById, parentId, childId);
}

export function connectNodeTree(
  nodes: readonly Node[],
  parentId: number,
  childId: number,
): Node[] | null {
  if (!canConnectNodes(nodes, parentId, childId)) return null;

  return nodes.map((node) => (
    node.id === childId ? { ...node, parentId } : node
  ));
}

export function moveNodeSubtree(
  nodes: readonly Node[],
  rootId: number,
  x: number,
  y: number,
): Node[] | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  let root: Node | undefined;
  const childrenByParent = new Map<number, number[]>();
  for (const current of nodes) {
    if (current.id === rootId) root = current;
    if (current.parentId !== null) {
      const children = childrenByParent.get(current.parentId);
      if (children) children.push(current.id);
      else childrenByParent.set(current.parentId, [current.id]);
    }
  }
  if (!root) return null;

  const dx = x - root.x;
  const dy = y - root.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;

  const subtreeIds = new Set<number>();
  const queue = [rootId];
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    if (subtreeIds.has(id)) continue;
    subtreeIds.add(id);
    for (const childId of childrenByParent.get(id) ?? []) queue.push(childId);
  }

  const movedNodes: Node[] = [];
  for (const current of nodes) {
    if (!subtreeIds.has(current.id) || (dx === 0 && dy === 0)) {
      movedNodes.push(current);
      continue;
    }
    const nextX = current.x + dx;
    const nextY = current.y + dy;
    if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return null;
    movedNodes.push({ ...current, x: nextX, y: nextY });
  }
  return movedNodes;
}
