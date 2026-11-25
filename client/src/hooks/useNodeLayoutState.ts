import { useCallback } from "react";
import type { MapHistoryGroupLease } from "@/domain/history/mapHistory";
import { layoutNodeForest } from "@/domain/nodes/nodeAutoLayout";
import { planBranchLayoutUpdate } from "@/domain/nodes/planBranchLayoutUpdate";
import {
  layoutContextFromState,
  resolveLayoutNodeForestOptions,
  type NodeMapLayoutContext,
} from "@/domain/nodes/nodeMapLayoutContext";
import {
  areLayoutSpacingEqual,
  clampLayoutSpacing,
  projectMapDocumentLayoutSpacing,
} from "@/domain/persistence/mapDocumentLayoutSpacing";
import { commitLayoutFieldUpdate } from "@/hooks/commitLayoutFieldUpdate";
import { useMapHistory } from "@/hooks/useMapHistory";
import type { BranchLayoutDirection } from "@/types/branchLayout";
import { projectLayoutStyle, type LayoutStyle } from "@/types/layoutStyle";
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
  layoutStyle: NodeMapState["layoutStyle"];
  branchLayouts: NodeMapState["branchLayouts"];
  relations: NodeMapState["relations"];
  groups: NodeMapState["groups"];
  tour: NodeMapState["tour"];
  canUndo: boolean;
  canRedo: boolean;
  // 同じイベント内の直前の変更も含めた最新の状態を読み取る。状態と履歴は変えない
  getCurrentState: () => NodeMapState;
  applyNonStructuralChange: (update: NodeChange) => boolean;
  // 配置モードに依存しない非構造の変更。グループ中は表示上の現在値だけを更新し、グループ外では1操作として確定する
  applyNonStructuralPreview: (update: NodeChange) => boolean;
  applyManualMove: (update: NodeChange) => boolean;
  // auto 中のピン座標ドラッグ用（子孫非追従）。preview 経路
  applyPinnedCoordinateMove: (update: NodeChange) => boolean;
  // ピンドラッグ終了時の再配置（グループ内 preview）
  relayoutAfterPinnedMove: () => boolean;
  applyTreeChange: (update: TreeChange) => boolean;
  // ノード以外（relations/groups）も含む1操作の文書変更
  applyStateChange: (update: StateChange) => boolean;
  setLayoutMode: (mode: NodeLayoutMode) => void;
  setTreeDirection: (direction: TreeDirection) => void;
  setLayoutSpacing: (spacing: LayoutSpacing) => void;
  // auto なら即リレイアウト 1 Undo。manual は様式のみ（UI は disabled）
  setLayoutStyle: (style: LayoutStyle) => void;
  // null＝エントリ削除。auto+orthogonal なら即リレイアウト。manual/radial は配列のみ
  setBranchLayout: (
    nodeId: number,
    direction: BranchLayoutDirection | null,
  ) => { ok: true } | { ok: false; reason: "locked" | "node-missing" | "invalid" | "placement-failed" };
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
    const layoutContext = layoutContextFromState(current);
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
    const layoutContext = layoutContextFromState(current);
    const candidate = update(current, layoutContext);
    if (!candidate) return false;

    // 候補 state の layout 設定を使う（様式・枝方向の即時再配置のため）
    const layoutOptions = resolveLayoutNodeForestOptions(layoutContextFromState(candidate));
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

    const layoutOptions = resolveLayoutNodeForestOptions(layoutContextFromState(current));
    const nextNodes = mode === "auto" ? layoutNodeForest(current.nodes, layoutOptions) : current.nodes;
    if (!nextNodes) return;

    commit({ ...current, layoutMode: mode, nodes: nextNodes });
  }, [getPresent, commit]);

  const setTreeDirection = useCallback((direction: TreeDirection) => {
    const current = getPresent();
    const currentDirection = current.treeDirection ?? "lr";
    if (currentDirection === direction) return;

    const projected = projectTreeDirection(direction);
    commitLayoutFieldUpdate(current, { treeDirection: projected }, commit);
  }, [getPresent, commit]);

  const setLayoutSpacing = useCallback((spacing: LayoutSpacing) => {
    const current = getPresent();
    const nextSpacing = clampLayoutSpacing(spacing);
    if (areLayoutSpacingEqual(current.layoutSpacing, nextSpacing)) return;

    const projected = projectLayoutSpacing(nextSpacing);
    commitLayoutFieldUpdate(current, { layoutSpacing: projected }, commit);
  }, [getPresent, commit]);

  const setLayoutStyle = useCallback((style: LayoutStyle) => {
    const current = getPresent();
    const currentStyle = current.layoutStyle ?? "orthogonal";
    if (currentStyle === style) return;

    const projected = projectLayoutStyle(style).layoutStyle;
    commitLayoutFieldUpdate(current, { layoutStyle: projected }, commit);
  }, [getPresent, commit]);

  const setBranchLayout = useCallback((
    nodeId: number,
    direction: BranchLayoutDirection | null,
  ) => {
    const current = getPresent();
    const planned = planBranchLayoutUpdate(current, nodeId, direction);
    if (!planned.ok) {
      if (planned.reason === "unchanged") return { ok: true } as const;
      if (planned.reason === "locked" || planned.reason === "node-missing") {
        return { ok: false, reason: planned.reason } as const;
      }
      return { ok: false, reason: "placement-failed" } as const;
    }
    commit(planned.state);
    return { ok: true } as const;
  }, [getPresent, commit]);

  // auto 中のピンドラッグ用。グループ中は preview、グループ外は1操作。layoutMode に依らず受理
  const applyPinnedCoordinateMove = useCallback((update: NodeChange): boolean => {
    const current = getPresent();
    const nextNodes = update(current.nodes);
    if (!nextNodes) return false;
    preview(withUpdatedNodes(current, nextNodes));
    return true;
  }, [getPresent, preview]);

  // ピンドラッグ終了時: 現在座標のまま他ノードを再配置して preview（グループ内なら1 Undo に載る）
  const relayoutAfterPinnedMove = useCallback((): boolean => {
    const current = getPresent();
    if (current.layoutMode !== "auto") return false;
    const layoutOptions = resolveLayoutNodeForestOptions(layoutContextFromState(current));
    const nextNodes = layoutNodeForest(current.nodes, layoutOptions);
    if (!nextNodes) return false;
    preview(withUpdatedNodes(current, nextNodes));
    return true;
  }, [getPresent, preview]);

  return {
    nodes: present.nodes,
    layoutMode: present.layoutMode,
    treeDirection: present.treeDirection,
    layoutSpacing: present.layoutSpacing,
    layoutStyle: present.layoutStyle,
    branchLayouts: present.branchLayouts,
    relations: present.relations,
    groups: present.groups,
    tour: present.tour,
    canUndo,
    canRedo,
    getCurrentState: getPresent,
    applyNonStructuralChange,
    applyNonStructuralPreview,
    applyManualMove,
    applyPinnedCoordinateMove,
    relayoutAfterPinnedMove,
    applyTreeChange,
    applyStateChange,
    setLayoutMode,
    setTreeDirection,
    setLayoutSpacing,
    setLayoutStyle,
    setBranchLayout,
    replaceLayoutState,
    undo,
    redo,
    beginMoveHistory: beginGroup,
  };
}
