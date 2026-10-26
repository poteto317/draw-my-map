import { useCallback, useMemo } from "react";
import {
  getNodeIndentAvailability,
  type ChangeNodeIndentResult,
  type NodeIndentDirection,
} from "@/domain/nodes/nodeIndent";
import { formatNodeIndentNotice } from "@/domain/nodes/nodeIndentMessages";
import type { Node } from "@/types/node";
import type { OperationNotice } from "@/types/operationNotice";

export type UseNodeIndentActionOptions = {
  selectedNodeId: number | null;
  nodes: readonly Node[];
  visibleNodeIds: ReadonlySet<number>;
  changeNodeIndent: (
    nodeId: number,
    direction: NodeIndentDirection,
    visibleNodeIds: ReadonlySet<number>,
  ) => ChangeNodeIndentResult;
  expandNodes: (nodeIds: readonly number[]) => void;
  publishNotice: (notice: OperationNotice) => void; // 枝の構造の変更の通知の枠
};

export type UseNodeIndentActionReturn = {
  canIndent: boolean;
  canOutdent: boolean;
  changeSelected: (direction: NodeIndentDirection) => void;
  change: (nodeId: number, direction: NodeIndentDirection) => void;
};

// 階層の上げ下げのボタンの有効・無効を持ち、成功した下げのときだけ新しい親を展開し、結果ごとに通知を1回発行する
export function useNodeIndentAction({
  selectedNodeId,
  nodes,
  visibleNodeIds,
  changeNodeIndent,
  expandNodes,
  publishNotice,
}: UseNodeIndentActionOptions): UseNodeIndentActionReturn {
  const availability = useMemo(
    () => getNodeIndentAvailability(nodes, selectedNodeId, visibleNodeIds),
    [nodes, selectedNodeId, visibleNodeIds],
  );

  const change = useCallback((nodeId: number, direction: NodeIndentDirection) => {
    const result = changeNodeIndent(nodeId, direction, visibleNodeIds);
    if (result.ok && result.direction === "indent" && result.newParentId !== null) {
      expandNodes([result.newParentId]);
    }
    publishNotice(formatNodeIndentNotice(result));
  }, [changeNodeIndent, visibleNodeIds, expandNodes, publishNotice]);

  const changeSelected = useCallback((direction: NodeIndentDirection) => {
    if (selectedNodeId === null) return;
    change(selectedNodeId, direction);
  }, [selectedNodeId, change]);

  return {
    canIndent: selectedNodeId !== null && availability.indent,
    canOutdent: selectedNodeId !== null && availability.outdent,
    changeSelected,
    change,
  };
}
