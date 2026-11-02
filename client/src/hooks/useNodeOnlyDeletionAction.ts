import { useCallback, useMemo } from "react";
import { canDeleteNodeOnly, type DeleteNodeOnlyResult } from "@/domain/nodes/nodeOnlyDeletion";
import { formatNodeOnlyDeletionFailureNotice } from "@/domain/nodes/nodeOnlyDeletionMessages";
import type { Node } from "@/types/node";
import type { OperationNotice } from "@/types/operationNotice";

export type UseNodeOnlyDeletionActionOptions = {
  selectedNodeId: number | null;
  nodes: readonly Node[];
  visibleNodeIds: ReadonlySet<number>;
  deleteNodeOnly: (nodeId: number, visibleNodeIds: ReadonlySet<number>) => DeleteNodeOnlyResult;
  publishNotice: (notice: OperationNotice) => void;
};
export type UseNodeOnlyDeletionActionReturn = { canDelete: boolean; deleteSelected: () => void };

export function useNodeOnlyDeletionAction({ selectedNodeId, nodes, visibleNodeIds, deleteNodeOnly, publishNotice }: UseNodeOnlyDeletionActionOptions): UseNodeOnlyDeletionActionReturn {
  const canDelete = useMemo(() => canDeleteNodeOnly(nodes, selectedNodeId, visibleNodeIds), [nodes, selectedNodeId, visibleNodeIds]);
  const deleteSelected = useCallback(() => {
    if (selectedNodeId === null) return;
    const result = deleteNodeOnly(selectedNodeId, visibleNodeIds);
    publishNotice(result.ok
      ? { kind: "status", message: "ノードだけ削除しました。子孫は残っています。" }
      : formatNodeOnlyDeletionFailureNotice(result.reason));
  }, [selectedNodeId, visibleNodeIds, deleteNodeOnly, publishNotice]);
  return { canDelete, deleteSelected };
}
