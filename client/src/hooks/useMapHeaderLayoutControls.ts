"use client";

import { useCallback, useMemo } from "react";
import type { MapHeaderLayoutControlsProps } from "@/components/layout/MapHeaderLayoutControls";
import type { EditorViewMode } from "@/components/layout/EditorViewModeControl";
import {
  resolveLabelBold,
  resolveLabelFontSize,
  resolveLabelUnderline,
} from "@/domain/nodes/labelTextStyle";
import type { LayoutSnapPrefs } from "@/domain/nodes/snapGrid";
import { useLayoutSnapPrefs } from "@/hooks/useLayoutSnapPrefs";
import { useSelectionLayoutActions } from "@/hooks/useSelectionLayoutActions";
import type { LabelFontSize } from "@/types/labelFontSize";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import type { NodeMapState } from "@/types/nodeMapState";
import type { LayoutSpacing } from "@/types/layoutSpacing";
import type { TreeDirection } from "@/types/treeDirection";

type UseMapHeaderLayoutControlsArgs = {
  viewMode: EditorViewMode;
  isProtectedMode: boolean;
  nodes: readonly Node[];
  layoutMode: NodeLayoutMode;
  treeDirection: NodeMapState["treeDirection"];
  layoutSpacing: NodeMapState["layoutSpacing"];
  selectedNodeId: number | null;
  selectedNodeIds: readonly number[];
  selectedNodeLocked: boolean;
  setTreeDirection: (direction: TreeDirection) => void;
  setLayoutSpacing: (spacing: LayoutSpacing) => void;
  commitManualNodes: (nextNodes: Node[]) => boolean;
  toggleNodeEditLock: (nodeId: number) => boolean;
  lockNodeSubtree: (rootId: number) => boolean;
  unlockNodeSubtree: (rootId: number) => boolean;
  setLabelFontSize: (id: number, size: LabelFontSize) => boolean;
  toggleLabelBold: (id: number) => boolean;
  toggleLabelUnderline: (id: number) => boolean;
};

type UseMapHeaderLayoutControlsReturn = {
  headerLayoutControls: MapHeaderLayoutControlsProps | null;
  layoutSnapPrefs: LayoutSnapPrefs;
};

export function useMapHeaderLayoutControls({
  viewMode,
  isProtectedMode,
  nodes,
  layoutMode,
  treeDirection,
  layoutSpacing,
  selectedNodeId,
  selectedNodeIds,
  selectedNodeLocked,
  setTreeDirection,
  setLayoutSpacing,
  commitManualNodes,
  toggleNodeEditLock,
  lockNodeSubtree,
  unlockNodeSubtree,
  setLabelFontSize,
  toggleLabelBold,
  toggleLabelUnderline,
}: UseMapHeaderLayoutControlsArgs): UseMapHeaderLayoutControlsReturn {
  const layoutSnap = useLayoutSnapPrefs();
  const selectionLayoutActions = useSelectionLayoutActions({
    nodes,
    layoutMode,
    selectedNodeIds,
    commitManualNodes,
  });

  const selectionLayoutActive = viewMode === "map" && selectedNodeIds.length >= 2;
  const lockControlsActive = viewMode === "map"
    && selectedNodeId !== null
    && selectedNodeIds.length === 1;

  const selectedNode = useMemo(
    () => (selectedNodeId === null
      ? null
      : nodes.find((node) => node.id === selectedNodeId) ?? null),
    [nodes, selectedNodeId],
  );

  // マップ表示 && 主選択===1 && !outline && !protect && 選択 ID が nodes に存在
  const labelTextStyleVisible =
    lockControlsActive && !isProtectedMode && selectedNode !== null;

  const onToggleNodeLock = useCallback(() => {
    if (selectedNodeId === null) return;
    toggleNodeEditLock(selectedNodeId);
  }, [selectedNodeId, toggleNodeEditLock]);

  const onLockSubtree = useCallback(() => {
    if (selectedNodeId === null) return;
    lockNodeSubtree(selectedNodeId);
  }, [lockNodeSubtree, selectedNodeId]);

  const onUnlockSubtree = useCallback(() => {
    if (selectedNodeId === null) return;
    unlockNodeSubtree(selectedNodeId);
  }, [selectedNodeId, unlockNodeSubtree]);

  const onLabelFontSizeChange = useCallback((size: LabelFontSize) => {
    if (selectedNodeId === null) return;
    setLabelFontSize(selectedNodeId, size);
  }, [selectedNodeId, setLabelFontSize]);

  const onToggleLabelBold = useCallback(() => {
    if (selectedNodeId === null) return;
    toggleLabelBold(selectedNodeId);
  }, [selectedNodeId, toggleLabelBold]);

  const onToggleLabelUnderline = useCallback(() => {
    if (selectedNodeId === null) return;
    toggleLabelUnderline(selectedNodeId);
  }, [selectedNodeId, toggleLabelUnderline]);

  const headerLayoutControls = useMemo((): MapHeaderLayoutControlsProps | null => {
    if (viewMode !== "map") return null;
    return {
      layoutMode,
      treeDirection,
      layoutSpacing,
      selectionActiveForSpacing: selectedNodeId !== null,
      selectionLayoutActive,
      selectionLayoutDisabled: !selectionLayoutActions.canUse,
      onTreeDirectionChange: setTreeDirection,
      onLayoutSpacingChange: setLayoutSpacing,
      onAlign: selectionLayoutActions.align,
      onDistribute: selectionLayoutActions.distribute,
      snapPrefs: layoutSnap.prefs,
      onSnapEnabledChange: layoutSnap.setEnabled,
      onSnapShowGridChange: layoutSnap.setShowGrid,
      onSnapGridStepChange: layoutSnap.setGridStep,
      lockControlsActive,
      nodeLocked: selectedNodeLocked,
      onToggleNodeLock,
      onLockSubtree,
      onUnlockSubtree,
      labelTextStyleVisible,
      labelTextStyleDisabled: selectedNodeLocked,
      labelFontSize: resolveLabelFontSize(selectedNode ?? {}),
      labelBold: resolveLabelBold(selectedNode ?? {}),
      labelUnderline: resolveLabelUnderline(selectedNode ?? {}),
      onLabelFontSizeChange,
      onToggleLabelBold,
      onToggleLabelUnderline,
    };
  }, [
    viewMode,
    layoutMode,
    treeDirection,
    layoutSpacing,
    selectedNodeId,
    selectionLayoutActive,
    selectionLayoutActions.canUse,
    selectionLayoutActions.align,
    selectionLayoutActions.distribute,
    layoutSnap.prefs,
    layoutSnap.setEnabled,
    layoutSnap.setShowGrid,
    layoutSnap.setGridStep,
    lockControlsActive,
    selectedNodeLocked,
    onToggleNodeLock,
    onLockSubtree,
    onUnlockSubtree,
    labelTextStyleVisible,
    selectedNode,
    onLabelFontSizeChange,
    onToggleLabelBold,
    onToggleLabelUnderline,
    setTreeDirection,
    setLayoutSpacing,
  ]);

  return {
    headerLayoutControls,
    layoutSnapPrefs: layoutSnap.prefs,
  };
}
