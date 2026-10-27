import { useCallback, useMemo, useState } from "react";
import { canInsertParentNode, type InsertParentNodeResult } from "@/domain/nodes/nodeParentInsertion";
import { formatNodeParentInsertionFailureNotice } from "@/domain/nodes/nodeParentInsertionMessages";
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
  const [storedRequest, setStoredRequest] = useState<NodeLabelEditRequest | null>(null);

  const insert = useCallback(
    (nodeId: number) => {
      const result = insertParentNode(nodeId, visibleNodeIds);
      if (result.ok) {
        clearNotice();
        setStoredRequest((previous) => ({
          nodeId: result.insertedId,
          sequence: (previous?.sequence ?? 0) + 1,
          documentRevision,
        }));
        return;
      }
      publishNotice(formatNodeParentInsertionFailureNotice(result.reason));
    },
    [insertParentNode, visibleNodeIds, documentRevision, publishNotice, clearNotice],
  );

  const insertSelected = useCallback(() => {
    if (selectedNodeId === null) return;
    insert(selectedNodeId);
  }, [selectedNodeId, insert]);

  const labelEditRequest =
    storedRequest !== null && storedRequest.documentRevision === documentRevision ? storedRequest : null;

  return { canInsert, insertSelected, insert, labelEditRequest };
}
