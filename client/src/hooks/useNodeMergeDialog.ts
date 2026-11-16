"use client";

import { useCallback, useMemo, useRef } from "react";
import { planNodeMerge, type MergeNodesResult, type NodeMergePlan } from "@/domain/nodes/nodeMerge";
import { formatNodeMergeFailureNotice } from "@/domain/nodes/nodeMergeMessages";
import { MERGE_DEFAULT_SEPARATOR } from "@/domain/nodes/nodeSeparator";
import type { NodeSplitMergeError, NodeSplitMergeFocusRequest } from "@/hooks/nodeSplitMergeDialogState";
import { buildNodeMergePreview, describeNodeMergeStatus, type NodeMergePreview } from "@/hooks/nodeMergePreview";
import { useLatestRef } from "@/hooks/useLatestRef";
import { useNodeSplitMergeDialogState } from "@/hooks/useNodeSplitMergeDialogState";
import type { Node } from "@/types/node";
import type { OperationNotice } from "@/types/operationNotice";

export type UseNodeMergeDialogOptions = {
  mapId: string;
  nodes: readonly Node[];
  selectedNodeId: number | null;
  selectedNodeIds: readonly number[];
  visibleNodeIds: ReadonlySet<number>;
  documentRevision: number;
  mergeNodes: (
    ids: readonly number[],
    primaryId: number | null,
    joiner: string,
    visibleNodeIds: ReadonlySet<number>,
    expected: NodeMergePlan,
  ) => MergeNodesResult;
  publishNotice: (notice: OperationNotice) => void;
};

export type UseNodeMergeDialogReturn = {
  screen: "closed" | "open";
  // 「ノードを統合」ボタンの有効判定（選択が 2 件以上。親が違うなどの理由は、開いたあとのプレビューで示す）
  canOpen: boolean;
  disabledReason: string;
  separatorPreset: string;
  customSeparator: string;
  // 計画が失敗しているときは null
  preview: NodeMergePreview | null;
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

// 開いた時点の選択集合と主選択を固定する。プレビューは最新の nodes から作り、確定は現在のプレビューの計画を expected として渡す
// （フックが最新の状態から再計画して照合する）。入力は即時に反映し、useDeferredValue で遅らせない（古いプレビューを確定できる隙間を作らない）
export function useNodeMergeDialog(options: UseNodeMergeDialogOptions): UseNodeMergeDialogReturn {
  const dialog = useNodeSplitMergeDialogState({ mapId: options.mapId, documentRevision: options.documentRevision });
  const { state, isOpen, stale, close, fail, open: showDialog } = dialog;
  const target = isOpen && state.target?.kind === "merge" ? state.target : null;
  const joiner = dialog.separator;
  const plan = useMemo(
    () => (target === null
      ? null
      : planNodeMerge(options.nodes, target.ids, target.primaryId, joiner, options.visibleNodeIds)),
    [target, options.nodes, options.visibleNodeIds, joiner],
  );
  const preview = useMemo(
    () => (plan === null ? null : buildNodeMergePreview(options.nodes, plan)),
    [plan, options.nodes],
  );
  const canSubmit = plan !== null && plan.ok && !stale;
  // 古いハンドラを呼ばれても、最後に commit された値で再判定する
  const latest = useLatestRef({ options, state, plan, canSubmit, joiner });
  const submittedRef = useRef(false);

  const openDialog = useCallback(() => {
    const { options: current } = latest.current;
    if (current.selectedNodeIds.length < 2) return;
    submittedRef.current = false;
    showDialog({
      target: { kind: "merge", ids: current.selectedNodeIds, primaryId: current.selectedNodeId },
      defaultSeparator: MERGE_DEFAULT_SEPARATOR,
      revision: current.documentRevision,
      mapId: current.mapId,
    });
  }, [showDialog, latest]);

  const submit = useCallback(() => {
    const { options: current, state: snapshot, plan: shownPlan, canSubmit: valid, joiner: shownJoiner } = latest.current;
    // 通常は canSubmit が偽でボタンが無効なので到達しない。古いハンドラや、確定を押した同じ処理での 2 回目の呼び出しでも
    // 何も変えない（stale・開いていない・計画の失敗は canSubmit に含まれる）
    if (!valid || submittedRef.current || shownPlan === null || snapshot.target?.kind !== "merge") return;

    const result = current.mergeNodes(
      snapshot.target.ids,
      snapshot.target.primaryId,
      shownJoiner,
      current.visibleNodeIds,
      shownPlan,
    );
    if (!result.ok) {
      fail(formatNodeMergeFailureNotice(result.reason).message);
      return;
    }
    submittedRef.current = true;
    current.publishNotice({ kind: "status", message: `${result.absorbedCount + 1} 件のノードを 1 件に統合しました。` });
    close();
  }, [close, fail, latest]);

  return {
    screen: isOpen ? "open" : "closed",
    canOpen: options.selectedNodeIds.length >= 2,
    disabledReason: formatNodeMergeFailureNotice("too-few-nodes").message,
    separatorPreset: dialog.separatorPreset,
    customSeparator: dialog.customSeparator,
    preview,
    statusText: describeNodeMergeStatus(stale, plan),
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
