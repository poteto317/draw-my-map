import { useCallback, useMemo } from "react";
import { canInsertParentNode, type InsertParentNodeResult } from "@/domain/nodes/nodeParentInsertion";
import { formatNodeParentInsertionFailureNotice } from "@/domain/nodes/nodeParentInsertionMessages";
import { useRevisionScopedNodeRequest } from "@/hooks/useRevisionScopedNodeRequest";
import type { Node } from "@/types/node";
import type { NodeLabelEditRequest } from "@/types/nodeLabelEditRequest";
import type { OperationNotice } from "@/types/operationNotice";

export type UseNodeParentInsertionActionOptions = {
  selectedNodeId: number | null;
  nodes: readonly Node[];
  visibleNodeIds: ReadonlySet<number>;
  documentRevision: number;
  insertParentNode: (nodeId: number, visibleNodeIds: ReadonlySet<number>) => InsertParentNodeResult;
  publishNotice: (notice: OperationNotice) => void;
  clearNotice: () => void;
};

export type UseNodeParentInsertionActionReturn = {
  canInsert: boolean;
  insertSelected: () => void;
  insert: (nodeId: number) => void;
  labelEditRequest: NodeLabelEditRequest | null;
};

// 親の挿入のボタンの有効・無効を持ち、成功したときだけ通知の枠を空にしてラベルの編集を要求し、失敗したときだけ通知を1回発行する
export function useNodeParentInsertionAction({
  selectedNodeId,
  nodes,
  visibleNodeIds,
  documentRevision,
  insertParentNode,
  publishNotice,
  clearNotice,
}: UseNodeParentInsertionActionOptions): UseNodeParentInsertionActionReturn {
  const canInsert = useMemo(
    () => canInsertParentNode(nodes, selectedNodeId, visibleNodeIds),
    [nodes, selectedNodeId, visibleNodeIds],
  );
  const { request: labelEditRequest, issueRequest: requestLabelEdit } = useRevisionScopedNodeRequest(documentRevision);

  const insert = useCallback(
    (nodeId: number) => {
      const result = insertParentNode(nodeId, visibleNodeIds);
      if (result.ok) {
        clearNotice();
        requestLabelEdit(result.insertedId);
        return;
      }
      publishNotice(formatNodeParentInsertionFailureNotice(result.reason));
    },
    [insertParentNode, visibleNodeIds, requestLabelEdit, publishNotice, clearNotice],
  );

  const insertSelected = useCallback(() => {
    if (selectedNodeId === null) return;
    insert(selectedNodeId);
  }, [selectedNodeId, insert]);

  return { canInsert, insertSelected, insert, labelEditRequest };
}
