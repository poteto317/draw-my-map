import {
  layoutNodeForest,
  type LayoutNodeForestOptions,
} from "@/domain/nodes/nodeAutoLayout";
import { assertNodesEditable } from "@/domain/nodes/nodeEditLock";
import { createSiblingNode } from "@/domain/nodes/nodePlacement";
import { collectSubtreeIds } from "@/domain/nodes/nodeTree";
import { DEFAULT_LAYOUT_SPACING } from "@/domain/persistence/mapDocumentLayoutSpacing";
import type { LayoutSpacing } from "@/types/layoutSpacing";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";

export type InsertSiblingAfterFailureReason =
  | "anchor-missing"
  | "locked"
  | "placement-failed"
  | "id-conflict";

export type InsertSiblingAfterResult =
  | { ok: true; nodes: Node[] }
  | { ok: false; reason: InsertSiblingAfterFailureReason };

export function insertSiblingAfter(
  nodes: readonly Node[],
  anchorId: number,
  newId: number,
  label: string,
  mode: NodeLayoutMode,
  spacing: LayoutSpacing = DEFAULT_LAYOUT_SPACING,
  layoutOptions?: LayoutNodeForestOptions,
): InsertSiblingAfterResult {
  const anchor = nodes.find((node) => node.id === anchorId);
  if (anchor === undefined) return { ok: false, reason: "anchor-missing" };

  const editableIds = anchor.parentId === null ? [anchorId] : [anchorId, anchor.parentId];
  const lockedCheck = assertNodesEditable(editableIds, nodes);
  if (!lockedCheck.ok && lockedCheck.reason === "locked") return { ok: false, reason: "locked" };
  if (nodes.some((node) => node.id === newId)) return { ok: false, reason: "id-conflict" };

  const created = createSiblingNode(nodes, anchorId, newId, spacing);
  if (created === null) return { ok: false, reason: "placement-failed" };
  const newNode: Node = { ...created, label };

  const subtreeIds = collectSubtreeIds(nodes, anchorId);
  let lastIndex = -1;
  for (let index = 0; index < nodes.length; index += 1) {
    if (subtreeIds.has(nodes[index]!.id)) lastIndex = index;
  }
  if (lastIndex < 0) return { ok: false, reason: "anchor-missing" };

  const next = [...nodes.slice(0, lastIndex + 1), newNode, ...nodes.slice(lastIndex + 1)];
  if (mode === "auto") {
    if (layoutOptions === undefined) return { ok: false, reason: "placement-failed" };
    const laid = layoutNodeForest(next, layoutOptions);
    if (laid === null) return { ok: false, reason: "placement-failed" };
    return { ok: true, nodes: laid };
  }
  return { ok: true, nodes: next };
}