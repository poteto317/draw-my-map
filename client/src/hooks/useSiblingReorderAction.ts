import { useCallback, useMemo } from "react";
import {
  getSiblingReorderAvailability,
  type ReorderSiblingResult,
  type SiblingReorderDirection,
  type SiblingReorderRequest,
} from "@/domain/nodes/nodeSiblingOrder";
import { formatSiblingReorderNotice } from "@/domain/nodes/nodeSiblingOrderMessages";
import { useRevisionScopedNotice } from "@/hooks/useRevisionScopedNotice";
import type { Node } from "@/types/node";
import type { OperationNotice } from "@/types/operationNotice";

export type UseSiblingReorderActionOptions = {
  selectedNodeId: number | null;
  nodes: readonly Node[];
  visibleNodeIds: ReadonlySet<number>;
  documentRevision: number;
  reorderSibling: (
    nodeId: number,
    request: SiblingReorderRequest,
    visibleNodeIds: ReadonlySet<number>,
  ) => ReorderSiblingResult;
};

export type UseSiblingReorderActionReturn = {
  canMoveUp: boolean;
  canMoveDown: boolean;
  moveSelected: (direction: SiblingReorderDirection) => void;
  reorder: (nodeId: number, request: SiblingReorderRequest) => void;
  notice: OperationNotice | null;
};

// 兄弟の並べ替えのボタンの有効・無効と、結果の通知を持つ。通知は次の要求か documentRevision の変化まで残す
export function useSiblingReorderAction({
  selectedNodeId,
  nodes,
  visibleNodeIds,
  documentRevision,
  reorderSibling,
}: UseSiblingReorderActionOptions): UseSiblingReorderActionReturn {
  const { notice, publishNotice } = useRevisionScopedNotice(documentRevision);

  const availability = useMemo(
    () => getSiblingReorderAvailability(nodes, selectedNodeId, visibleNodeIds),
    [nodes, selectedNodeId, visibleNodeIds],
  );

  const reorder = useCallback((nodeId: number, request: SiblingReorderRequest) => {
    const result = reorderSibling(nodeId, request, visibleNodeIds);
    publishNotice(formatSiblingReorderNotice(result));
  }, [reorderSibling, visibleNodeIds, publishNotice]);

  const moveSelected = useCallback((direction: SiblingReorderDirection) => {
    if (selectedNodeId === null) return;
    reorder(selectedNodeId, { kind: "step", direction });
  }, [selectedNodeId, reorder]);

  return {
    canMoveUp: selectedNodeId !== null && availability.up,
    canMoveDown: selectedNodeId !== null && availability.down,
    moveSelected,
    reorder,
    notice,
  };
}
