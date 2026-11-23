"use client";

import { useCallback, useState } from "react";
import { buildExtractBranchDisplayLabel } from "@/domain/nodes/extractBranchToMap";
import {
  canSubmitBranchExtract,
  closeBranchExtractDialog,
  consumeBranchExtractFocusRequest,
  createBranchExtractDialogState,
  failBranchExtractDialog,
  openBranchExtractDialog,
  staleBranchExtractError,
  type BranchExtractError,
  type BranchExtractFocusRequest,
} from "@/hooks/branchExtractDialogState";
import type { MapLibraryOperationResult } from "@/hooks/useMapLibrary";
import { useLatestRef } from "@/hooks/useLatestRef";
import type { Node } from "@/types/node";

export type UseBranchExtractDialogOptions = {
  nodes: readonly Node[];
  selectedNodeId: number | null;
  documentRevision: number;
  onExtractBranchToNewMap: (rootId: number) => MapLibraryOperationResult;
};

export type UseBranchExtractDialogReturn = {
  screen: "closed" | "open";
  displayLabel: string;
  focusRequest: BranchExtractFocusRequest;
  error: BranchExtractError;
  canSubmit: boolean;
  open: () => void;
  close: () => void;
  consumeFocusRequest: () => void;
  submit: () => void;
};

const FALLBACK_FAILURE = "枝を別マップに切り出せませんでした。切り出すノードとマップの状態を確認してやり直してください。";

export function useBranchExtractDialog(options: UseBranchExtractDialogOptions): UseBranchExtractDialogReturn {
  const [state, setState] = useState(createBranchExtractDialogState);
  const source = options.nodes.find((node) => node.id === state.sourceId);
  const stale = state.screen === "open" && state.openedRevision !== options.documentRevision;
  const canSubmit = canSubmitBranchExtract({ state, source, stale });
  const latest = useLatestRef({ options, state, canSubmit });

  const displayLabel = source === undefined
    ? ""
    : buildExtractBranchDisplayLabel(source.label);

  const open = useCallback(() => {
    const { options: current } = latest.current;
    const selectedId = current.selectedNodeId;
    if (selectedId === null || !current.nodes.some((node) => node.id === selectedId)) return;
    setState((prev) => openBranchExtractDialog(prev, {
      sourceId: selectedId,
      revision: current.documentRevision,
    }));
  }, [latest]);

  const close = useCallback(() => {
    setState(closeBranchExtractDialog);
  }, []);

  const consumeFocusRequest = useCallback(() => {
    setState(consumeBranchExtractFocusRequest);
  }, []);

  const submit = useCallback(() => {
    const { options: current, state: snapshot, canSubmit: valid } = latest.current;
    if (!valid || snapshot.sourceId === null) return;
    const result = current.onExtractBranchToNewMap(snapshot.sourceId);
    if (!result.ok) {
      const message = "notice" in result ? result.notice.message : FALLBACK_FAILURE;
      setState((prev) => failBranchExtractDialog(prev, message));
      return;
    }
    close();
  }, [close, latest]);

  return {
    screen: state.screen,
    displayLabel,
    focusRequest: state.focusRequest,
    error: stale ? staleBranchExtractError(state.error) : state.error,
    canSubmit,
    open,
    close,
    consumeFocusRequest,
    submit,
  };
}