"use client";

import { useCallback, useMemo, useState } from "react";
import { listBranchMoveParentCandidates } from "@/domain/nodes/nodeBranchMove";
import { collectSelfAndAncestorIds } from "@/domain/nodes/nodeTree";
import {
  canSubmitBranchMove,
  closeBranchMoveDialog,
  consumeBranchMoveFocusRequest,
  createBranchMoveDialogState,
  failBranchMoveDialog,
  openBranchMoveDialog,
  selectBranchMoveParentTarget,
  selectBranchMoveTargetMap,
  staleBranchMoveError,
  toBranchMoveParentId,
  type BranchMoveError,
  type BranchMoveFocusRequest,
  type BranchMoveMapTarget,
} from "@/hooks/branchMoveDialogState";
import type { MapLibraryOperationResult } from "@/hooks/useMapLibrary";
import { useLatestRef } from "@/hooks/useLatestRef";
import type { MoveBranchResult } from "@/hooks/useNodes";
import type { Node } from "@/types/node";
import type { ResolutionFilterMode } from "@/types/nodeResolution";
import type { OperationNotice } from "@/types/operationNotice";

export type UseBranchMoveDialogOptions = {
  mapId: string;
  mapMoveTargets: readonly BranchMoveMapTarget[];
  nodes: readonly Node[];
  selectedNodeId: number | null;
  documentRevision: number;
  moveBranch: (rootId: number, parentId: number | null) => MoveBranchResult;
  onMoveBranchToMap: (rootId: number, targetMapId: string) => MapLibraryOperationResult;
  expandNodes: (ids: readonly number[]) => void;
  resolutionVisibleNodeIds: ReadonlySet<number>;
  setResolutionMode: (mode: ResolutionFilterMode) => void;
  publishNotice: (notice: OperationNotice) => void;
};

export type UseBranchMoveDialogReturn = {
  screen: "closed" | "open";
  targetMapId: string;
  parentTarget: string;
  focusRequest: BranchMoveFocusRequest;
  error: BranchMoveError;
  sameMap: boolean;
  parentCandidates: readonly Node[];
  allowRoot: boolean;
  canSubmit: boolean;
  open: () => void;
  close: () => void;
  setTargetMapId: (targetMapId: string) => void;
  setParentTarget: (parentTarget: string) => void;
  consumeFocusRequest: () => void;
  submit: () => void;
};

const MOVE_FAILED_MESSAGE = "枝を移動できませんでした。移動先を選び直してください。";

// 同じマップの中へ移した枝が見えるように、祖先を展開し、隠れる解像度なら全表示にして通知する
function revealMovedBranch(options: UseBranchMoveDialogOptions, rootId: number, parentId: number | null) {
  options.expandNodes(collectSelfAndAncestorIds(options.nodes, parentId));
  // 見える集合は祖先を含むので、移動元が見えていれば移動先の祖先も移動後に見える
  if (!options.resolutionVisibleNodeIds.has(rootId)) {
    options.setResolutionMode("all");
  }
  options.publishNotice({ kind: "status", message: "枝を移動しました。Fキーで選択ノードへ移動できます。" });
}

// 開始時の移動元を固定する。選択候補は毎回最新の木から導き、確定前には編集しない。
export function useBranchMoveDialog(options: UseBranchMoveDialogOptions): UseBranchMoveDialogReturn {
  const [state, setState] = useState(() => createBranchMoveDialogState(options.mapId));
  const source = options.nodes.find((node) => node.id === state.sourceId);
  const stale = state.screen === "open" && state.openedRevision !== options.documentRevision;
  const parentCandidates = useMemo(
    () => (source === undefined ? [] : listBranchMoveParentCandidates(options.nodes, source)),
    [options.nodes, source],
  );
  const allowRoot = source !== undefined && source.parentId !== null;
  const sameMap = state.targetMapId === options.mapId;
  const canSubmit = canSubmitBranchMove({
    state,
    source,
    stale,
    mapMoveTargets: options.mapMoveTargets,
    sameMap,
    allowRoot,
    parentCandidates,
  });
  // 古いハンドラを呼ばれても、最後にcommitされたrevisionと候補で再判定する。
  const latest = useLatestRef({ options, state, canSubmit, sameMap });

  const open = useCallback(() => {
    const { options: current } = latest.current;
    if (!current.nodes.some((node) => node.id === current.selectedNodeId)) return;
    setState((prev) => openBranchMoveDialog(prev, {
      sourceId: current.selectedNodeId,
      revision: current.documentRevision,
      mapId: current.mapId,
    }));
  }, [latest]);

  const close = useCallback(() => {
    setState(closeBranchMoveDialog);
  }, []);

  const setTargetMapId = useCallback((targetMapId: string) => {
    setState((prev) => selectBranchMoveTargetMap(prev, targetMapId));
  }, []);

  const setParentTarget = useCallback((parentTarget: string) => {
    setState((prev) => selectBranchMoveParentTarget(prev, parentTarget));
  }, []);

  const consumeFocusRequest = useCallback(() => {
    setState(consumeBranchMoveFocusRequest);
  }, []);

  const submit = useCallback(() => {
    const { options: current, state: snapshot, canSubmit: valid, sameMap: local } = latest.current;
    if (!valid || snapshot.sourceId === null) return;
    const parentId = toBranchMoveParentId(snapshot.parentTarget);
    const result = local
      ? current.moveBranch(snapshot.sourceId, parentId)
      : current.onMoveBranchToMap(snapshot.sourceId, snapshot.targetMapId);
    if (!result.ok) {
      const message = "notice" in result ? result.notice.message : MOVE_FAILED_MESSAGE;
      setState((prev) => failBranchMoveDialog(prev, message));
      return;
    }
    if (local) revealMovedBranch(current, snapshot.sourceId, parentId);
    close();
  }, [close, latest]);

  return {
    screen: state.screen,
    targetMapId: state.targetMapId,
    parentTarget: state.parentTarget,
    focusRequest: state.focusRequest,
    error: stale ? staleBranchMoveError(state.error) : state.error,
    sameMap,
    parentCandidates,
    allowRoot,
    canSubmit,
    open,
    close,
    setTargetMapId,
    setParentTarget,
    consumeFocusRequest,
    submit,
  };
}
