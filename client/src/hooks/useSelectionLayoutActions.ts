import { useCallback, useMemo } from "react";
import {
  alignSelection,
  type SelectionAlignOp,
} from "@/domain/nodes/selectionAlign";
import {
  distributeSelection,
  type SelectionDistributeAxis,
} from "@/domain/nodes/selectionDistribute";
import { resolveSelectedNodes } from "@/domain/nodes/selectionLayoutShared";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";

export type SelectionLayoutActionFailureReason =
  | "manual-only"
  | "insufficient-selection"
  | "locked"
  | "no-change"
  | "not-applied";

export type SelectionLayoutActionOutcome =
  | { ok: true }
  | { ok: false; reason: SelectionLayoutActionFailureReason };

type UseSelectionLayoutActionsArgs = {
  nodes: readonly Node[];
  layoutMode: NodeLayoutMode;
  selectedNodeIds: readonly number[];
  commitManualNodes: (nextNodes: Node[]) => boolean;
};

function isNoChange(current: readonly Node[], next: readonly Node[]): boolean {
  if (current.length !== next.length) return false;
  return current.every((node, index) => (
    node.id === next[index]?.id
    && node.x === next[index]?.x
    && node.y === next[index]?.y
  ));
}

export function useSelectionLayoutActions({
  nodes,
  layoutMode,
  selectedNodeIds,
  commitManualNodes,
}: UseSelectionLayoutActionsArgs) {
  const eligibility = useMemo(() => {
    if (layoutMode !== "manual") {
      return { canUse: false as const, reason: "manual-only" as const };
    }

    const resolved = resolveSelectedNodes(nodes, selectedNodeIds);
    if (!resolved.ok) {
      return { canUse: false as const, reason: resolved.reason };
    }

    return { canUse: true as const };
  }, [layoutMode, nodes, selectedNodeIds]);

  const applyNodes = useCallback((nextNodes: Node[]): SelectionLayoutActionOutcome => {
    if (isNoChange(nodes, nextNodes)) {
      return { ok: false, reason: "no-change" };
    }
    const applied = commitManualNodes(nextNodes);
    if (!applied) return { ok: false, reason: "not-applied" };
    return { ok: true };
  }, [commitManualNodes, nodes]);

  const align = useCallback((op: SelectionAlignOp): SelectionLayoutActionOutcome => {
    if (layoutMode !== "manual") {
      return { ok: false, reason: "manual-only" };
    }

    const result = alignSelection(nodes, selectedNodeIds, op);
    if (!result.ok) return result;
    return applyNodes(result.nodes);
  }, [applyNodes, layoutMode, nodes, selectedNodeIds]);

  const distribute = useCallback((axis: SelectionDistributeAxis): SelectionLayoutActionOutcome => {
    if (layoutMode !== "manual") {
      return { ok: false, reason: "manual-only" };
    }

    const result = distributeSelection(nodes, selectedNodeIds, axis);
    if (!result.ok) return result;
    return applyNodes(result.nodes);
  }, [applyNodes, layoutMode, nodes, selectedNodeIds]);

  return {
    canUse: eligibility.canUse,
    unavailableReason: eligibility.canUse ? null : eligibility.reason,
    align,
    distribute,
  };
}