"use client";

import { useCallback, useState } from "react";
import {
  closeNodeSplitMergeDialog,
  consumeNodeSplitMergeFocusRequest,
  createNodeSplitMergeDialogState,
  currentNodeSeparator,
  dismissNodeSplitMergeDialog,
  failNodeSplitMergeDialog,
  isNodeSplitMergeDialogOpen,
  openNodeSplitMergeDialog,
  setNodeSeparatorCustom,
  setNodeSeparatorPreset,
  staleNodeSplitMergeError,
  type NodeSplitMergeDialogState,
  type NodeSplitMergeError,
  type NodeSplitMergeFocusRequest,
  type OpenNodeSplitMergeDialogInput,
} from "@/hooks/nodeSplitMergeDialogState";

export type UseNodeSplitMergeDialogStateOptions = {
  mapId: string;
  documentRevision: number;
};

/**
 * 分割・統合のダイアログの共通状態。
 *
 * `state` は加工前の値（`target`・`openedRevision` などを機能ごとのフックが読む）。
 * `error`・`separator`・`stale` は加工後の値で、画面の表示と確定の判定にはこちらを使う。
 * `state.error` を直接読むと、stale のときの誤り（更新を促す文言）が反映されない。
 */
export type UseNodeSplitMergeDialogStateReturn = {
  state: NodeSplitMergeDialogState;
  isOpen: boolean;
  // 開いた後に文書が変わった（確定できない）
  stale: boolean;
  // 現在の入力が表す区切り文字（プレビューと確定で同じ値を使う）
  separator: string;
  separatorPreset: string;
  customSeparator: string;
  // stale のときは、状態の誤りより優先して更新を促す誤りにする
  error: NodeSplitMergeError;
  // 外から閉じられた（mapId が変わった）ときは dismissNodeSplitMergeDialog が null にしている
  focusRequest: NodeSplitMergeFocusRequest;
  open: (opened: OpenNodeSplitMergeDialogInput) => void;
  close: () => void;
  fail: (message: string) => void;
  setSeparatorPreset: (presetId: string) => void;
  setCustomSeparator: (value: string) => void;
  consumeFocusRequest: () => void;
};

// 分割・統合のダイアログに共通する状態（開閉・区切り文字・フォーカスの要求・stale と誤りの表示）を持つ。
// 対象の固定・計画・プレビュー・確定は機能ごとのフックが持つ
export function useNodeSplitMergeDialogState(options: UseNodeSplitMergeDialogStateOptions): UseNodeSplitMergeDialogStateReturn {
  const [state, setState] = useState(createNodeSplitMergeDialogState);
  const isOpen = isNodeSplitMergeDialogOpen(state, options.mapId);
  // 別のマップへ切り替わったら、閉じた状態へ戻す（フォーカスは奪わない）。元のマップへ戻っても古い入力は復活しない
  if (state.screen === "open" && !isOpen) setState(dismissNodeSplitMergeDialog);
  const stale = isOpen && state.openedRevision !== options.documentRevision;

  const open = useCallback((opened: OpenNodeSplitMergeDialogInput) => {
    setState((prev) => openNodeSplitMergeDialog(prev, opened));
  }, []);

  const close = useCallback(() => {
    setState(closeNodeSplitMergeDialog);
  }, []);

  const fail = useCallback((message: string) => {
    setState((prev) => failNodeSplitMergeDialog(prev, message));
  }, []);

  const setSeparatorPreset = useCallback((presetId: string) => {
    setState((prev) => setNodeSeparatorPreset(prev, presetId));
  }, []);

  const setCustomSeparator = useCallback((value: string) => {
    setState((prev) => setNodeSeparatorCustom(prev, value));
  }, []);

  const consumeFocusRequest = useCallback(() => {
    setState(consumeNodeSplitMergeFocusRequest);
  }, []);

  return {
    state,
    isOpen,
    stale,
    separator: currentNodeSeparator(state),
    separatorPreset: state.separatorPreset,
    customSeparator: state.customSeparator,
    error: stale ? staleNodeSplitMergeError(state.error) : state.error,
    focusRequest: state.focusRequest,
    open,
    close,
    fail,
    setSeparatorPreset,
    setCustomSeparator,
    consumeFocusRequest,
  };
}
