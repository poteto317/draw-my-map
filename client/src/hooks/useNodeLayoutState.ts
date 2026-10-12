import { useCallback } from "react";
import type { MapHistoryGroupLease } from "@/domain/history/mapHistory";
import { layoutNodeForest } from "@/domain/nodes/nodeAutoLayout";
import { useMapHistory } from "@/hooks/useMapHistory";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import type { NodeMapState } from "@/types/nodeMapState";

type UseNodeLayoutStateReturn = {
  nodes: Node[];
  layoutMode: NodeLayoutMode;
  canUndo: boolean;
  canRedo: boolean;
  applyNonStructuralChange: (update: NodeChange) => boolean;
  applyManualMove: (update: NodeChange) => boolean;
  applyTreeChange: (update: NodeChange) => boolean;
  setLayoutMode: (mode: NodeLayoutMode) => void;
  replaceLayoutState: (nodes: Node[], mode: NodeLayoutMode) => void;
  undo: () => boolean;
  redo: () => boolean;
  beginMoveHistory: () => MapHistoryGroupLease;
};

type NodeChange = (currentNodes: readonly Node[]) => Node[] | null;

const EMPTY_MAP_STATE: NodeMapState = { layoutMode: "manual", nodes: [] };

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

  const replaceLayoutState = useCallback((nextNodes: Node[], mode: NodeLayoutMode) => {
    reset({ layoutMode: mode, nodes: nextNodes });
  }, [reset]);

  const applyNonStructuralChange = useCallback((update: NodeChange): boolean => {
    const current = getPresent();
    const nextNodes = update(current.nodes);
    if (!nextNodes) return false;

    commit({ layoutMode: current.layoutMode, nodes: nextNodes });
    return true;
  }, [getPresent, commit]);

  // 移動グループ中は表示上の現在値だけを更新し、グループ外では1操作として確定する
  const applyManualMove = useCallback((update: NodeChange): boolean => {
    const current = getPresent();
    if (current.layoutMode === "auto") return false;
    const nextNodes = update(current.nodes);
    if (!nextNodes) return false;

    preview({ layoutMode: current.layoutMode, nodes: nextNodes });
    return true;
  }, [getPresent, preview]);

  const applyTreeChange = useCallback((update: NodeChange): boolean => {
    const current = getPresent();
    const candidateNodes = update(current.nodes);
    if (!candidateNodes) return false;

    const nextNodes = current.layoutMode === "auto"
      ? layoutNodeForest(candidateNodes)
      : candidateNodes;
    if (!nextNodes) return false;

    commit({ layoutMode: current.layoutMode, nodes: nextNodes });
    return true;
  }, [getPresent, commit]);

  const setLayoutMode = useCallback((mode: NodeLayoutMode) => {
    const current = getPresent();
    if (mode === current.layoutMode) return;

    const nextNodes = mode === "auto" ? layoutNodeForest(current.nodes) : current.nodes;
    if (!nextNodes) return;

    commit({ layoutMode: mode, nodes: nextNodes });
  }, [getPresent, commit]);

  return {
    nodes: present.nodes,
    layoutMode: present.layoutMode,
    canUndo,
    canRedo,
    applyNonStructuralChange,
    applyManualMove,
    applyTreeChange,
    setLayoutMode,
    replaceLayoutState,
    undo,
    redo,
    beginMoveHistory: beginGroup,
  };
}
