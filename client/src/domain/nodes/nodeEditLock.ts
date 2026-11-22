import { collectSubtreeIds } from "@/domain/nodes/nodeTree";
import type { Node } from "@/types/node";

export type NodesEditableResult =
  | { ok: true }
  | { ok: false; reason: "locked" | "node-missing" };

export function isNodeEditable(node: Node): boolean {
  return node.locked !== true;
}

export function assertNodesEditable(
  nodeIds: ReadonlyArray<number>,
  nodes: readonly Node[],
): NodesEditableResult {
  const uniqueIds = [...new Set(nodeIds)];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const id of uniqueIds) {
    if (!byId.has(id)) return { ok: false, reason: "node-missing" };
  }
  for (const id of uniqueIds) {
    if (byId.get(id)!.locked === true) return { ok: false, reason: "locked" };
  }
  return { ok: true };
}

export function lockSubtree(nodes: readonly Node[], rootId: number): Node[] | null {
  if (!nodes.some((node) => node.id === rootId)) return null;
  const subtreeIds = collectSubtreeIds(nodes, rootId);
  let changed = false;
  const next = nodes.map((node) => {
    if (!subtreeIds.has(node.id) || node.locked === true) return node;
    changed = true;
    return { ...node, locked: true as const };
  });
  return changed ? next : [...nodes];
}

export function unlockSubtree(nodes: readonly Node[], rootId: number): Node[] | null {
  if (!nodes.some((node) => node.id === rootId)) return null;
  const subtreeIds = collectSubtreeIds(nodes, rootId);
  let changed = false;
  const next = nodes.map((node) => {
    if (!subtreeIds.has(node.id) || node.locked !== true) return node;
    changed = true;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- locked キーを外すため
    const { locked, ...rest } = node;
    return rest;
  });
  return changed ? next : [...nodes];
}

export function toggleNodeLock(nodes: readonly Node[], nodeId: number): Node[] | null {
  const target = nodes.find((node) => node.id === nodeId);
  if (target === undefined) return null;
  if (target.locked === true) {
    const next = nodes.map((node) => {
      if (node.id !== nodeId) return node;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- locked キーを外すため
      const { locked, ...rest } = node;
      return rest;
    });
    return next;
  }
  return nodes.map((node) => (
    node.id === nodeId ? { ...node, locked: true as const } : node
  ));
}

export function assertManualPositionCommitAllowed(
  current: readonly Node[],
  next: readonly Node[],
): NodesEditableResult {
  const nextById = new Map(next.map((node) => [node.id, node]));
  for (const node of current) {
    if (node.locked !== true) continue;
    const updated = nextById.get(node.id);
    if (updated === undefined) return { ok: false, reason: "locked" };
    const positionChanged = node.x !== updated.x || node.y !== updated.y;
    if (positionChanged) return { ok: false, reason: "locked" };
  }
  return { ok: true };
}