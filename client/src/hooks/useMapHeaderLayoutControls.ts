"use client";

import { useCallback, useMemo } from "react";
import type { MapHeaderLayoutControlsProps } from "@/components/layout/MapHeaderLayoutControls";
import type { EditorViewMode } from "@/components/layout/EditorViewModeControl";
import {
  resolveLayoutSpacingHeaderControl,
  resolveLayoutStyleHeaderControl,
  resolveTreeDirectionHeaderControl,
} from "@/domain/map/mapLayoutStyleAvailability";
import {
  resolveLabelBold,
  resolveLabelFontSize,
  resolveLabelUnderline,
} from "@/domain/nodes/labelTextStyle";
import type { LayoutSnapPrefs } from "@/domain/nodes/snapGrid";
import { useLayoutSnapPrefs } from "@/hooks/useLayoutSnapPrefs";
import { useSelectionLayoutActions } from "@/hooks/useSelectionLayoutActions";
import type { LabelFontSize } from "@/types/labelFontSize";
import type { LayoutStyle } from "@/types/layoutStyle";
import type { MapCanvasSelection } from "@/types/mapCanvasSelection";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import type { NodeMapState } from "@/types/nodeMapState";
import type { LayoutSpacing } from "@/types/layoutSpacing";
import type { TreeDirection } from "@/types/treeDirection";

type UseMapHeaderLayoutControlsArgs = {
  viewMode: EditorViewMode;
  isProtectedMode: boolean;
  hasConflict?: boolean;
  isExternallyDeleted?: boolean;
  canvasSelection?: MapCanvasSelection;
  nodes: readonly Node[];
  layoutMode: NodeLayoutMode;
  layoutStyle: NodeMapState["layoutStyle"];
  treeDirection: NodeMapState["treeDirection"];
  layoutSpacing: NodeMapState["layoutSpacing"];
  selectedNodeId: number | null;
  selectedNodeIds: readonly number[];
  selectedNodeLocked: boolean;
  setLayoutStyle: (style: LayoutStyle) => void;
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
  hasConflict = false,
  isExternallyDeleted = false,
  canvasSelection,
  nodes,
  layoutMode,
  layoutStyle,
  treeDirection,
  layoutSpacing,
  selectedNodeId,
  selectedNodeIds,
  selectedNodeLocked,
  setLayoutStyle,
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
    const guardInput = {
      viewMode,
      isProtectedMode,
      hasConflict,
      isExternallyDeleted,
      canvasSelection,
      layoutMode,
      layoutStyle,
    };
    // visible の正本は domain（viewMode !== "map" は baseHeaderState が担う）
    const styleHeader = resolveLayoutStyleHeaderControl(guardInput);
    if (!styleHeader.visible) return null;

    const treeHeader = resolveTreeDirectionHeaderControl(guardInput);
    const spacingHeader = resolveLayoutSpacingHeaderControl(guardInput);

    return {
      layoutMode,
      layoutStyle,
      treeDirection,
      layoutSpacing,
      layoutStyleDisabled: styleHeader.disabled,
      treeDirectionDisabled: treeHeader.disabled,
      treeDirectionDisabledReason: treeHeader.disabledReason,
      layoutSpacingDisabled: spacingHeader.disabled,
      selectionActiveForSpacing: selectedNodeId !== null,
      selectionLayoutActive,
      selectionLayoutDisabled: !selectionLayoutActions.canUse,
      onLayoutStyleChange: setLayoutStyle,
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
    isProtectedMode,
    hasConflict,
    isExternallyDeleted,
    canvasSelection,
    layoutMode,
    layoutStyle,
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
    setLayoutStyle,
    setTreeDirection,
    setLayoutSpacing,
  ]);

  return {
    headerLayoutControls,
    layoutSnapPrefs: layoutSnap.prefs,
  };
}
