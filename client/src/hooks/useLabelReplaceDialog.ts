"use client";

import { useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
import { listLabelReplacements, planLabelReplace, type LabelReplaceRow } from "@/domain/search/nodeLabelReplace";
import {
  closeLabelReplaceDialog,
  consumeLabelReplaceFocusRequest,
  createLabelReplaceDialogState,
  failLabelReplaceDialog,
  isLabelReplaceDialogOpen,
  openLabelReplaceDialog,
  resolveLabelReplaceTargetIds,
  setLabelReplaceQuery,
  setLabelReplaceReplacement,
  setLabelReplaceScopeSelectedOnly,
  staleLabelReplaceError,
  dismissLabelReplaceDialog,
  type LabelReplaceError,
  type LabelReplaceFocusRequest,
} from "@/hooks/labelReplaceDialogState";
import {
  describeLabelReplaceStatus,
  LABEL_REPLACE_PREVIEW_LIMIT,
  selectLabelReplacePreviewRows,
} from "@/hooks/labelReplacePreview";
import { useLatestRef } from "@/hooks/useLatestRef";
import type { Node } from "@/types/node";
import type { OperationNotice } from "@/types/operationNotice";

const REPLACE_FAILED_MESSAGE = "ラベルを置換できませんでした。もう一度お試しください。";

export type UseLabelReplaceDialogOptions = {
  mapId: string;
  nodes: readonly Node[];
  selectedNodeIds: readonly number[];
  documentRevision: number;
  updateNodeLabels: (replacements: ReadonlyMap<number, string>) => boolean;
  publishNotice: (notice: OperationNotice) => void;
};

export type UseLabelReplaceDialogReturn = {
  screen: "closed" | "open";
  query: string;
  replacement: string;
  scopeSelectedOnly: boolean;
  scopeCount: number;
  previewRows: readonly LabelReplaceRow[];
  hiddenReplaceCount: number;
  previewLimit: number;
  replaceCount: number;
  statusText: string;
  submitLabel: string;
  error: LabelReplaceError;
  focusRequest: LabelReplaceFocusRequest;
  canSubmit: boolean;
  open: () => void;
  close: () => void;
  setQuery: (query: string) => void;
  setReplacement: (replacement: string) => void;
  setScopeSelectedOnly: (value: boolean) => void;
  consumeFocusRequest: () => void;
  submit: () => void;
};

const NO_ROWS: readonly LabelReplaceRow[] = [];

// 開いた時点の選択集合を固定する。プレビューは最新の nodes から作り、確定の直前にも計画を作り直す
export function useLabelReplaceDialog(options: UseLabelReplaceDialogOptions): UseLabelReplaceDialogReturn {
  const [state, setState] = useState(createLabelReplaceDialogState);
  const open = isLabelReplaceDialogOpen(state, options.mapId);
  // 別のマップへ切り替わったら、閉じた状態へ戻す（フォーカスは奪わない）。元のマップへ戻っても古い入力は復活しない
  if (state.screen === "open" && !open) setState(dismissLabelReplaceDialog);
  const stale = open && state.openedRevision !== options.documentRevision;
  const deferredQuery = useDeferredValue(state.query);
  // 開き直した直後に、前回の検索語（遅延した値）でプレビューを作らない
  const effectiveQuery = state.query === "" ? "" : deferredQuery;
  const deferredReplacement = useDeferredValue(state.replacement);
  // 遅れて追いつく最中は、古いプレビューで確定させない
  const pending = deferredQuery !== state.query || deferredReplacement !== state.replacement;
  const targetIds = useMemo(
    () => resolveLabelReplaceTargetIds(state.scopeSelectedOnly, state.scopeIds),
    [state.scopeSelectedOnly, state.scopeIds],
  );
  const plan = useMemo(
    () => (open
      ? planLabelReplace(options.nodes, { query: effectiveQuery, replacement: deferredReplacement, targetIds })
      : null),
    [open, options.nodes, effectiveQuery, deferredReplacement, targetIds],
  );
  const { shown, hiddenReplaceCount } = useMemo(
    () => (plan === null ? { shown: NO_ROWS, hiddenReplaceCount: 0 } : selectLabelReplacePreviewRows(plan.rows)),
    [plan],
  );
  const replaceCount = plan?.replaceCount ?? 0;
  // 検索語が空なら plan が空になるので replaceCount > 0 に含まれる
  const canSubmit = open && !stale && !pending && replaceCount > 0;
  // 古いハンドラを呼ばれても、最後に commit された値で再判定する
  const latest = useLatestRef({ options, state, open, canSubmit });
  const submittedRef = useRef(false);

  const openDialog = useCallback(() => {
    const { options: current } = latest.current;
    if (current.nodes.length === 0) return;
    submittedRef.current = false;
    setState((prev) => openLabelReplaceDialog(prev, {
      selectedIds: current.selectedNodeIds,
      revision: current.documentRevision,
      mapId: current.mapId,
    }));
  }, [latest]);

  const close = useCallback(() => {
    setState(closeLabelReplaceDialog);
  }, []);

  const setQuery = useCallback((query: string) => {
    setState((prev) => setLabelReplaceQuery(prev, query));
  }, []);

  const setReplacement = useCallback((replacement: string) => {
    setState((prev) => setLabelReplaceReplacement(prev, replacement));
  }, []);

  const setScopeSelectedOnly = useCallback((value: boolean) => {
    setState((prev) => setLabelReplaceScopeSelectedOnly(prev, value));
  }, []);

  const consumeFocusRequest = useCallback(() => {
    setState(consumeLabelReplaceFocusRequest);
  }, []);

  const submit = useCallback(() => {
    const { options: current, state: snapshot, open: isOpen, canSubmit: valid } = latest.current;
    // 通常は canSubmit が偽でボタンが無効なので到達しない。古いハンドラや、プレビューが入力に追いついていない
    // すき間（pending）で呼ばれても何も変えない。stale・検索語が空・対象なしも canSubmit に含まれる
    if (!isOpen || !valid || submittedRef.current) return;

    // 古いプレビューを信じず、最新のノードと現在の入力から計画を作り直す
    const fresh = planLabelReplace(current.nodes, {
      query: snapshot.query,
      replacement: snapshot.replacement,
      targetIds: resolveLabelReplaceTargetIds(snapshot.scopeSelectedOnly, snapshot.scopeIds),
    });
    const replacements = listLabelReplacements(fresh);
    if (replacements.size === 0) return;

    if (!current.updateNodeLabels(replacements)) {
      setState((prev) => failLabelReplaceDialog(prev, REPLACE_FAILED_MESSAGE));
      return;
    }
    submittedRef.current = true;
    current.publishNotice({ kind: "status", message: `${replacements.size}件のノードのラベルを置換しました。` });
    close();
  }, [close, latest]);

  return {
    screen: open ? "open" : "closed",
    query: state.query,
    replacement: state.replacement,
    scopeSelectedOnly: state.scopeSelectedOnly,
    scopeCount: state.scopeIds.length,
    previewRows: shown,
    hiddenReplaceCount,
    previewLimit: LABEL_REPLACE_PREVIEW_LIMIT,
    replaceCount,
    // 計画と同じ遅延後の検索語で作る（入力直後の 1 レンダーに古い計画と新しい検索語を組み合わせない）
    statusText: describeLabelReplaceStatus({
      stale,
      query: effectiveQuery,
      // 表示から外れた replace 行も一致行に数える（unchanged だけが数えない）
      matchedRowCount: shown.length + hiddenReplaceCount,
      replaceCount,
      emptiedCount: plan?.emptiedCount ?? 0,
    }),
    submitLabel: `${replaceCount}件を置換`,
    error: stale ? staleLabelReplaceError(state.error) : state.error,
    // 外から閉じられた（mapId が変わった）ときは dismissLabelReplaceDialog が null にしている
    focusRequest: state.focusRequest,
    canSubmit,
    open: openDialog,
    close,
    setQuery,
    setReplacement,
    setScopeSelectedOnly,
    consumeFocusRequest,
    submit,
  };
}
