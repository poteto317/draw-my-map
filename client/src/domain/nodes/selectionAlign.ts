import {
  applyNodePositionUpdates,
  resolveSelectedNodes,
  type SelectionLayoutResult,
} from "@/domain/nodes/selectionLayoutShared";
import type { Node } from "@/types/node";

export type SelectionAlignOp =
  | "align-left"
  | "align-center-x"
  | "align-right"
  | "align-top"
  | "align-center-y"
  | "align-bottom";

function selectionBounds(nodes: readonly Node[]) {
  const left = Math.min(...nodes.map((node) => node.x));
  const right = Math.max(...nodes.map((node) => node.x + node.width));
  const top = Math.min(...nodes.map((node) => node.y));
  const bottom = Math.max(...nodes.map((node) => node.y + node.height));
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  return { left, right, top, bottom, centerX, centerY };
}

export function alignSelection(
  nodes: readonly Node[],
  selectedIds: readonly number[],
  op: SelectionAlignOp,
): SelectionLayoutResult {
  const resolved = resolveSelectedNodes(nodes, selectedIds);
  if (!resolved.ok) return resolved;

  const selectedNodes = resolved.selectedNodes!;
  const bounds = selectionBounds(selectedNodes);
  const updates = new Map<number, { x: number; y: number }>();

  for (const node of selectedNodes) {
    let x = node.x;
    let y = node.y;

    switch (op) {
      case "align-left":
        x = bounds.left;
        break;
      case "align-center-x":
        x = bounds.centerX - node.width / 2;
        break;
      case "align-right":
        x = bounds.right - node.width;
        break;
      case "align-top":
        y = bounds.top;
        break;
      case "align-center-y":
        y = bounds.centerY - node.height / 2;
        break;
      case "align-bottom":
        y = bounds.bottom - node.height;
        break;
      default:
        break;
    }

    updates.set(node.id, { x, y });
  }

  const nextNodes = applyNodePositionUpdates(nodes, updates);
  if (!nextNodes) {
    return { ok: true, nodes: [...nodes] };
  }

  return { ok: true, nodes: nextNodes };
}