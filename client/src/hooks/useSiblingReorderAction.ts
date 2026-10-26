import { useCallback, useMemo } from "react";
import {
  getSiblingReorderAvailability,
  type ReorderSiblingResult,
  type SiblingReorderDirection,
  type SiblingReorderRequest,
} from "@/domain/nodes/nodeSiblingOrder";
import { formatSiblingReorderNotice } from "@/domain/nodes/nodeSiblingOrderMessages";
import type { Node } from "@/types/node";
import type { OperationNotice } from "@/types/operationNotice";

export type UseSiblingReorderActionOptions = {
  selectedNodeId: number | null;
  nodes: readonly Node[];
  visibleNodeIds: ReadonlySet<number>;
  reorderSibling: (
    nodeId: number,
    request: SiblingReorderRequest,
    visibleNodeIds: ReadonlySet<number>,
  ) => ReorderSiblingResult;
  publishNotice: (notice: OperationNotice) => void; // 枝の構造の変更の通知の枠
};

export type UseSiblingReorderActionReturn = {
  canMoveUp: boolean;
  canMoveDown: boolean;
  moveSelected: (direction: SiblingReorderDirection) => void;
  reorder: (nodeId: number, request: SiblingReorderRequest) => void;
};

// 兄弟の並べ替えのボタンの有効・無効を持ち、結果ごとに通知を1回発行する。通知の枠は呼び出し元が持つ
export function useSiblingReorderAction({
  selectedNodeId,
  nodes,
  visibleNodeIds,
  reorderSibling,
  publishNotice,
}: UseSiblingReorderActionOptions): UseSiblingReorderActionReturn {
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
  };
}
