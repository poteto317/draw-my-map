import { assertNodesEditable } from "@/domain/nodes/nodeEditLock";
import { applyNodePositionUpdates } from "@/domain/nodes/selectionLayoutShared";
import type { Node } from "@/types/node";

export type SetNodeLayoutPinnedResult =
  | { ok: true; nodes: Node[] }
  | { ok: false; reason: "locked" | "node-missing" | "unchanged" };

/** layoutPinned の付与／解除。locked は拒否。値に変化が無ければ unchanged。 */
export function applySetNodeLayoutPinned(
  nodes: readonly Node[],
  nodeId: number,
  pinned: boolean,
): SetNodeLayoutPinnedResult {
  const target = nodes.find((node) => node.id === nodeId);
  if (target === undefined) return { ok: false, reason: "node-missing" };

  const lockedCheck = assertNodesEditable([nodeId], nodes);
  if (!lockedCheck.ok && lockedCheck.reason === "locked") {
    return { ok: false, reason: "locked" };
  }

  const currentlyPinned = target.layoutPinned === true;
  if (currentlyPinned === pinned) return { ok: false, reason: "unchanged" };

  const nextNodes = nodes.map((node) => {
    if (node.id !== nodeId) return node;
    if (pinned) return { ...node, layoutPinned: true as const };
    const { layoutPinned: _removed, ...rest } = node;
    return rest;
  });
  return { ok: true, nodes: nextNodes };
}

/** ピン留めノード単体の座標更新（子孫は動かさない）。locked / 非ピンは null。 */
export function movePinnedNodeCoordinate(
  nodes: readonly Node[],
  nodeId: number,
  x: number,
  y: number,
): Node[] | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const target = nodes.find((node) => node.id === nodeId);
  if (target === undefined) return null;
  if (target.locked === true) return null;
  if (target.layoutPinned !== true) return null;
  return applyNodePositionUpdates(nodes, new Map([[nodeId, { x, y }]]));
}
