import {
  applyNodePositionUpdates,
  resolveSelectedNodes,
  type SelectionLayoutResult,
} from "@/domain/nodes/selectionLayoutShared";
import type { Node } from "@/types/node";

export type SelectionDistributeAxis = "x" | "y";

function sortByAxis(nodes: readonly Node[], axis: SelectionDistributeAxis): Node[] {
  return [...nodes].sort((a, b) => (
    axis === "x" ? a.x - b.x : a.y - b.y
  ));
}

export function distributeSelection(
  nodes: readonly Node[],
  selectedIds: readonly number[],
  axis: SelectionDistributeAxis,
): SelectionLayoutResult {
  const resolved = resolveSelectedNodes(nodes, selectedIds);
  if (!resolved.ok) return resolved;

  const sorted = sortByAxis(resolved.selectedNodes!, axis);
  if (sorted.length < 3) {
    return { ok: true, nodes: [...nodes] };
  }

  const updates = new Map<number, { x: number; y: number }>();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  if (axis === "x") {
    const leftBound = first.x;
    const rightBound = last.x + last.width;
    const fixedWidth = first.width + last.width + sorted
      .slice(1, -1)
      .reduce((sum, node) => sum + node.width, 0);
    const gap = (rightBound - leftBound - fixedWidth) / (sorted.length - 1);

    let cursor = leftBound + first.width + gap;
    for (const node of sorted.slice(1, -1)) {
      updates.set(node.id, { x: cursor, y: node.y });
      cursor += node.width + gap;
    }
  } else {
    const topBound = first.y;
    const bottomBound = last.y + last.height;
    const fixedHeight = first.height + last.height + sorted
      .slice(1, -1)
      .reduce((sum, node) => sum + node.height, 0);
    const gap = (bottomBound - topBound - fixedHeight) / (sorted.length - 1);

    let cursor = topBound + first.height + gap;
    for (const node of sorted.slice(1, -1)) {
      updates.set(node.id, { x: node.x, y: cursor });
      cursor += node.height + gap;
    }
  }

  const nextNodes = applyNodePositionUpdates(nodes, updates);
  if (!nextNodes) {
    return { ok: true, nodes: [...nodes] };
  }

  return { ok: true, nodes: nextNodes };
}