import { useCallback } from "react";
import type { MapHistoryGroupLease } from "@/domain/history/mapHistory";
import { layoutNodeForest } from "@/domain/nodes/nodeAutoLayout";
import {
  resolveLayoutNodeForestOptions,
  type NodeMapLayoutContext,
} from "@/domain/nodes/resolveLayoutSpacing";
import {
  areLayoutSpacingEqual,
  clampLayoutSpacing,
  projectMapDocumentLayoutSpacing,
} from "@/domain/persistence/mapDocumentLayoutSpacing";
import { useMapHistory } from "@/hooks/useMapHistory";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import type { NodeMapState } from "@/types/nodeMapState";
import type { LayoutSpacing } from "@/types/layoutSpacing";
import type { TreeDirection } from "@/types/treeDirection";

export type { NodeMapLayoutContext };

type UseNodeLayoutStateReturn = {
  nodes: Node[];
  layoutMode: NodeLayoutMode;
  treeDirection: NodeMapState["treeDirection"];
  layoutSpacing: NodeMapState["layoutSpacing"];
  relations: NodeMapState["relations"];
  groups: NodeMapState["groups"];
  canUndo: boolean;
  canRedo: boolean;
  // 同じイベント内の直前の変更も含めた最新の状態を読み取る。状態と履歴は変えない
  getCurrentState: () => NodeMapState;
  applyNonStructuralChange: (update: NodeChange) => boolean;
  // 配置モードに依存しない非構造の変更。グループ中は表示上の現在値だけを更新し、グループ外では1操作として確定する
  applyNonStructuralPreview: (update: NodeChange) => boolean;
  applyManualMove: (update: NodeChange) => boolean;
  applyTreeChange: (update: TreeChange) => boolean;
  // ノード以外（relations/groups）も含む1操作の文書変更
  applyStateChange: (update: StateChange) => boolean;
  setLayoutMode: (mode: NodeLayoutMode) => void;
  setTreeDirection: (direction: TreeDirection) => void;
  setLayoutSpacing: (spacing: LayoutSpacing) => void;
  replaceLayoutState: (state: NodeMapState) => void;
  undo: () => boolean;
  redo: () => boolean;
  beginMoveHistory: () => MapHistoryGroupLease;
};

type NodeChange = (currentNodes: readonly Node[]) => Node[] | null;
// 候補生成は確定時点の最新の配置モードとレイアウト設定を受け取る
export type TreeChange = (
  currentNodes: readonly Node[],
  mode: NodeLayoutMode,
  layout: NodeMapLayoutContext,
) => Node[] | null;

export type StateChange = (
  current: NodeMapState,
  layout: NodeMapLayoutContext,
) => NodeMapState | null;

const EMPTY_MAP_STATE: NodeMapState = { layoutMode: "manual", nodes: [] };

function withUpdatedNodes(state: NodeMapState, nodes: Node[]): NodeMapState {
  return {
    ...state,
    nodes,
  };
}

function projectTreeDirection(direction: TreeDirection): NodeMapState["treeDirection"] {
  return direction === "tb" ? "tb" : undefined;
}

function projectLayoutSpacing(spacing: LayoutSpacing): NodeMapState["layoutSpacing"] {
  return projectMapDocumentLayoutSpacing(spacing).layoutSpacing;
}

// ノード配列と配置モードの単一所有者は履歴。返すbooleanは候補を受理したかを表し、
// 同値で履歴が変わらなくても受理した候補ならtrueを返す
export function useNodeLayoutState(): UseNodeLayoutStateReturn {
  const {
    present,
    canUndo,
    canRedo,
    getPresent,
    commit,
    preview,
    beginGroup,
    reset,
    undo,
    redo,
  } = useMapHistory(EMPTY_MAP_STATE);

  const replaceLayoutState = useCallback((state: NodeMapState) => {
    reset(state);
  }, [reset]);

  const applyNonStructuralChange = useCallback((update: NodeChange): boolean => {
    const current = getPresent();
    const nextNodes = update(current.nodes);
    if (!nextNodes) return false;

    commit(withUpdatedNodes(current, nextNodes));
    return true;
  }, [getPresent, commit]);

  // 履歴グループ中は表示上の現在値だけを更新し、グループ外では1操作として確定する。
  // applyManualMove と違い、自動配置でも受理する（詳細メモの途中反映に使う）
  const applyNonStructuralPreview = useCallback((update: NodeChange): boolean => {
    const current = getPresent();
    const nextNodes = update(current.nodes);
    if (!nextNodes) return false;

    preview(withUpdatedNodes(current, nextNodes));
    return true;
  }, [getPresent, preview]);

  // 移動グループ中は表示上の現在値だけを更新し、グループ外では1操作として確定する
  const applyManualMove = useCallback((update: NodeChange): boolean => {
    const current = getPresent();
    if (current.layoutMode === "auto") return false;
    const nextNodes = update(current.nodes);
    if (!nextNodes) return false;

    preview(withUpdatedNodes(current, nextNodes));
    return true;
  }, [getPresent, preview]);

  const applyTreeChange = useCallback((update: TreeChange): boolean => {
    const current = getPresent();
    const layoutContext: NodeMapLayoutContext = {
      treeDirection: current.treeDirection,
      layoutSpacing: current.layoutSpacing,
    };
    const candidateNodes = update(current.nodes, current.layoutMode, layoutContext);
    if (!candidateNodes) return false;

    const layoutOptions = resolveLayoutNodeForestOptions(layoutContext);
    const nextNodes = current.layoutMode === "auto"
      ? layoutNodeForest(candidateNodes, layoutOptions)
      : candidateNodes;
    if (!nextNodes) return false;

    commit(withUpdatedNodes(current, nextNodes));
    return true;
  }, [getPresent, commit]);

  const applyStateChange = useCallback((update: StateChange): boolean => {
    const current = getPresent();
    const layoutContext: NodeMapLayoutContext = {
      treeDirection: current.treeDirection,
      layoutSpacing: current.layoutSpacing,
    };
    const candidate = update(current, layoutContext);
    if (!candidate) return false;

    const layoutOptions = resolveLayoutNodeForestOptions(layoutContext);
    const nextNodes = current.layoutMode === "auto"
      ? layoutNodeForest(candidate.nodes, layoutOptions)
      : candidate.nodes;
    if (!nextNodes) return false;

    commit({ ...candidate, nodes: nextNodes });
    return true;
  }, [getPresent, commit]);

  const setLayoutMode = useCallback((mode: NodeLayoutMode) => {
    const current = getPresent();
    if (mode === current.layoutMode) return;

    const layoutOptions = resolveLayoutNodeForestOptions(current);
    const nextNodes = mode === "auto" ? layoutNodeForest(current.nodes, layoutOptions) : current.nodes;
    if (!nextNodes) return;

    commit({ ...current, layoutMode: mode, nodes: nextNodes });
  }, [getPresent, commit]);

  const setTreeDirection = useCallback((direction: TreeDirection) => {
    const current = getPresent();
    const currentDirection = current.treeDirection ?? "lr";
    if (currentDirection === direction) return;

    const layoutContext: NodeMapLayoutContext = {
      treeDirection: projectTreeDirection(direction) ?? "lr",
      layoutSpacing: current.layoutSpacing,
    };
    const layoutOptions = resolveLayoutNodeForestOptions(layoutContext);
    const nextNodes = current.layoutMode === "auto"
      ? layoutNodeForest(current.nodes, layoutOptions)
      : current.nodes;
    if (current.layoutMode === "auto" && !nextNodes) return;

    commit({
      ...current,
      treeDirection: projectTreeDirection(direction),
      nodes: nextNodes ?? current.nodes,
    });
  }, [getPresent, commit]);

  const setLayoutSpacing = useCallback((spacing: LayoutSpacing) => {
    const current = getPresent();
    const nextSpacing = clampLayoutSpacing(spacing);
    if (areLayoutSpacingEqual(current.layoutSpacing, nextSpacing)) return;

    const projected = projectLayoutSpacing(nextSpacing);
    const layoutOptions = resolveLayoutNodeForestOptions({
      treeDirection: current.treeDirection,
      layoutSpacing: projected,
    });
    const nextNodes = current.layoutMode === "auto"
      ? layoutNodeForest(current.nodes, layoutOptions)
      : current.nodes;
    if (current.layoutMode === "auto" && !nextNodes) return;

    commit({
      ...current,
      layoutSpacing: projected,
      nodes: nextNodes ?? current.nodes,
    });
  }, [getPresent, commit]);

  return {
    nodes: present.nodes,
    layoutMode: present.layoutMode,
    treeDirection: present.treeDirection,
    layoutSpacing: present.layoutSpacing,
    relations: present.relations,
    groups: present.groups,
    canUndo,
    canRedo,
    getCurrentState: getPresent,
    applyNonStructuralChange,
    applyNonStructuralPreview,
    applyManualMove,
    applyTreeChange,
    applyStateChange,
    setLayoutMode,
    setTreeDirection,
    setLayoutSpacing,
    replaceLayoutState,
    undo,
    redo,
    beginMoveHistory: beginGroup,
  };
}
