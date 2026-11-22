import { assertNodesEditable } from "@/domain/nodes/nodeEditLock";
import type { Node } from "@/types/node";

export type SelectionLayoutFailureReason =
  | "insufficient-selection"
  | "locked";

export type SelectionLayoutResult =
  | { ok: true; nodes: Node[] }
  | { ok: false; reason: SelectionLayoutFailureReason };

export type ResolvedSelection =
  | { ok: true; selectedNodes: Node[] }
  | { ok: false; reason: SelectionLayoutFailureReason };

export function resolveSelectedNodes(
  nodes: readonly Node[],
  selectedIds: readonly number[],
): ResolvedSelection {
  const uniqueIds = [...new Set(selectedIds)];
  if (uniqueIds.length < 2) {
    return { ok: false, reason: "insufficient-selection" };
  }

  const selectedNodes = uniqueIds
    .map((id) => nodes.find((node) => node.id === id))
    .filter((node): node is Node => node !== undefined);

  if (selectedNodes.length < 2) {
    return { ok: false, reason: "insufficient-selection" };
  }

  const lockedCheck = assertNodesEditable(uniqueIds, nodes);
  if (!lockedCheck.ok && lockedCheck.reason === "locked") {
    return { ok: false, reason: "locked" };
  }

  return { ok: true, selectedNodes };
}

export function applyNodePositionUpdates(
  nodes: readonly Node[],
  updates: ReadonlyMap<number, { x: number; y: number }>,
): Node[] | null {
  let changed = false;
  const next = nodes.map((node) => {
    const position = updates.get(node.id);
    if (!position) return node;
    if (position.x === node.x && position.y === node.y) return node;
    changed = true;
    return { ...node, x: position.x, y: position.y };
  });
  return changed ? next : null;
}