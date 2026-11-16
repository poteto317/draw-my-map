"use client";

import { useCallback, useMemo, useRef } from "react";
import { SPLIT_DEFAULT_SEPARATOR } from "@/domain/nodes/nodeSeparator";
import { canSplitNode, planNodeSplit, type NodeSplitPlan, type SplitNodeResult } from "@/domain/nodes/nodeSplit";
import { formatNodeSplitFailureNotice } from "@/domain/nodes/nodeSplitMessages";
import type { NodeSplitMergeError, NodeSplitMergeFocusRequest } from "@/hooks/nodeSplitMergeDialogState";
import { describeNodeSplitStatus } from "@/hooks/nodeSplitPreview";
import { useLatestRef } from "@/hooks/useLatestRef";
import { useNodeSplitMergeDialogState } from "@/hooks/useNodeSplitMergeDialogState";
import type { Node } from "@/types/node";
import type { OperationNotice } from "@/types/operationNotice";

const NO_FRAGMENTS: readonly string[] = [];

export type UseNodeSplitDialogOptions = {
  mapId: string;
  nodes: readonly Node[];
  selectedNodeId: number | null;
  visibleNodeIds: ReadonlySet<number>;
  documentRevision: number;
  splitNode: (
    nodeId: number,
    separator: string,
    visibleNodeIds: ReadonlySet<number>,
    expected: NodeSplitPlan,
  ) => SplitNodeResult;
  publishNotice: (notice: OperationNotice) => void;
};

export type UseNodeSplitDialogReturn = {
  screen: "closed" | "open";
  // 「ノードを分割」ボタンの有効判定（対象が存在し可視。断片数は区切り文字しだいなので含めない）
  canOpen: boolean;
  disabledReason: string;
  targetLabel: string;
  separatorPreset: string;
  customSeparator: string;
  fragments: readonly string[];
  statusText: string;
  error: NodeSplitMergeError;
  focusRequest: NodeSplitMergeFocusRequest;
  canSubmit: boolean;
  open: () => void;
  close: () => void;
  setSeparatorPreset: (presetId: string) => void;
  setCustomSeparator: (value: string) => void;
  consumeFocusRequest: () => void;
  submit: () => void;
};

// 開いた時点の主選択を固定する。プレビューは最新の nodes から作り、確定は現在のプレビューの計画を expected として渡す
// （フックが最新の状態から再計画して照合する）。入力は即時に反映し、useDeferredValue で遅らせない（古いプレビューを確定できる隙間を作らない）
export function useNodeSplitDialog(options: UseNodeSplitDialogOptions): UseNodeSplitDialogReturn {
  const dialog = useNodeSplitMergeDialogState({ mapId: options.mapId, documentRevision: options.documentRevision });
  const { state, isOpen, stale, close, fail, open: showDialog } = dialog;
  const target = isOpen && state.target?.kind === "split" ? state.target : null;
  const separator = dialog.separator;
  const plan = useMemo(
    () => (target === null ? null : planNodeSplit(options.nodes, target.nodeId, separator, options.visibleNodeIds)),
    [target, options.nodes, options.visibleNodeIds, separator],
  );
  const canSubmit = plan !== null && plan.ok && !stale;
  // 古いハンドラを呼ばれても、最後に commit された値で再判定する
  const latest = useLatestRef({ options, state, plan, canSubmit, separator });
  const submittedRef = useRef(false);

  const openDialog = useCallback(() => {
    const { options: current } = latest.current;
    const nodeId = current.selectedNodeId;
    if (nodeId === null || !canSplitNode(current.nodes, nodeId, current.visibleNodeIds)) return;
    submittedRef.current = false;
    showDialog({
      target: { kind: "split", nodeId },
      defaultSeparator: SPLIT_DEFAULT_SEPARATOR,
      revision: current.documentRevision,
      mapId: current.mapId,
    });
  }, [showDialog, latest]);

  const submit = useCallback(() => {
    const { options: current, state: snapshot, plan: shownPlan, canSubmit: valid, separator: shownSeparator } = latest.current;
    // 通常は canSubmit が偽でボタンが無効なので到達しない。古いハンドラや、確定を押した同じ処理での 2 回目の呼び出しでも
    // 何も変えない（stale・開いていない・計画の失敗は canSubmit に含まれる）
    if (!valid || submittedRef.current || shownPlan === null || snapshot.target?.kind !== "split") return;

    const result = current.splitNode(snapshot.target.nodeId, shownSeparator, current.visibleNodeIds, shownPlan);
    if (!result.ok) {
      fail(formatNodeSplitFailureNotice(result.reason).message);
      return;
    }
    submittedRef.current = true;
    current.publishNotice({ kind: "status", message: `ノードを ${result.insertedIds.length + 1} 件に分割しました。` });
    close();
  }, [close, fail, latest]);

  const targetNode = target === null ? undefined : options.nodes.find((node) => node.id === target.nodeId);
  return {
    screen: isOpen ? "open" : "closed",
    canOpen: canSplitNode(options.nodes, options.selectedNodeId, options.visibleNodeIds),
    disabledReason: formatNodeSplitFailureNotice("node-missing").message,
    targetLabel: targetNode?.label ?? "",
    separatorPreset: dialog.separatorPreset,
    customSeparator: dialog.customSeparator,
    fragments: plan !== null && plan.ok ? plan.fragments : NO_FRAGMENTS,
    statusText: describeNodeSplitStatus(stale, plan),
    error: dialog.error,
    focusRequest: dialog.focusRequest,
    canSubmit,
    open: openDialog,
    close,
    setSeparatorPreset: dialog.setSeparatorPreset,
    setCustomSeparator: dialog.setCustomSeparator,
    consumeFocusRequest: dialog.consumeFocusRequest,
    submit,
  };
}
