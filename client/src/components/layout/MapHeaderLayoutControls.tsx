"use client";

import { LabelTextStyleControl } from "@/components/layout/LabelTextStyleControl";
import { LayoutSpacingControl } from "@/components/layout/LayoutSpacingControl";
import { LayoutStyleControl } from "@/components/layout/LayoutStyleControl";
import { LockControls } from "@/components/layout/LockControls";
import { SelectionAlignMenu } from "@/components/layout/SelectionAlignMenu";
import { SnapGridControl } from "@/components/layout/SnapGridControl";
import { TreeDirectionControl } from "@/components/layout/TreeDirectionControl";
import type { HeaderControlDisabledReason } from "@/domain/map/mapHeaderLayoutControlTypes";
import type { LayoutSnapPrefs } from "@/domain/nodes/snapGrid";
import type { SelectionLayoutActionOutcome } from "@/hooks/useSelectionLayoutActions";
import type { SelectionAlignOp } from "@/domain/nodes/selectionAlign";
import type { SelectionDistributeAxis } from "@/domain/nodes/selectionDistribute";
import type { LabelFontSize } from "@/types/labelFontSize";
import type { LayoutStyle } from "@/types/layoutStyle";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import type { LayoutSpacing } from "@/types/layoutSpacing";
import type { NodeMapState } from "@/types/nodeMapState";
import type { TreeDirection } from "@/types/treeDirection";

export type MapHeaderLayoutControlsProps = {
  layoutMode: NodeLayoutMode;
  layoutStyle: NodeMapState["layoutStyle"];
  treeDirection: NodeMapState["treeDirection"];
  layoutSpacing: NodeMapState["layoutSpacing"];
  layoutStyleDisabled: boolean;
  treeDirectionDisabled: boolean;
  treeDirectionDisabledReason: HeaderControlDisabledReason;
  layoutSpacingDisabled: boolean;
  selectionActiveForSpacing: boolean;
  selectionLayoutActive: boolean;
  selectionLayoutDisabled: boolean;
  onLayoutStyleChange: (style: LayoutStyle) => void;
  onTreeDirectionChange: (direction: TreeDirection) => void;
  onLayoutSpacingChange: (spacing: LayoutSpacing) => void;
  onAlign: (op: SelectionAlignOp) => SelectionLayoutActionOutcome;
  onDistribute: (axis: SelectionDistributeAxis) => SelectionLayoutActionOutcome;
  snapPrefs: LayoutSnapPrefs;
  onSnapEnabledChange: (enabled: boolean) => void;
  onSnapShowGridChange: (showGrid: boolean) => void;
  onSnapGridStepChange: (gridStep: number) => void;
  lockControlsActive: boolean;
  nodeLocked: boolean;
  onToggleNodeLock: () => void;
  onLockSubtree: () => void;
  onUnlockSubtree: () => void;
  labelTextStyleVisible: boolean;
  labelTextStyleDisabled: boolean;
  labelFontSize: LabelFontSize;
  labelBold: boolean;
  labelUnderline: boolean;
  onLabelFontSizeChange: (size: LabelFontSize) => void;
  onToggleLabelBold: () => void;
  onToggleLabelUnderline: () => void;
};

export function MapHeaderLayoutControls({
  layoutMode,
  layoutStyle,
  treeDirection,
  layoutSpacing,
  layoutStyleDisabled,
  treeDirectionDisabled,
  treeDirectionDisabledReason,
  layoutSpacingDisabled,
  selectionActiveForSpacing,
  selectionLayoutActive,
  selectionLayoutDisabled,
  onLayoutStyleChange,
  onTreeDirectionChange,
  onLayoutSpacingChange,
  onAlign,
  onDistribute,
  snapPrefs,
  onSnapEnabledChange,
  onSnapShowGridChange,
  onSnapGridStepChange,
  lockControlsActive,
  nodeLocked,
  onToggleNodeLock,
  onLockSubtree,
  onUnlockSubtree,
  labelTextStyleVisible,
  labelTextStyleDisabled,
  labelFontSize,
  labelBold,
  labelUnderline,
  onLabelFontSizeChange,
  onToggleLabelBold,
  onToggleLabelUnderline,
}: MapHeaderLayoutControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <LayoutStyleControl
        layoutStyle={layoutStyle}
        disabled={layoutStyleDisabled}
        onChange={onLayoutStyleChange}
      />
      <TreeDirectionControl
        treeDirection={treeDirection}
        disabled={treeDirectionDisabled}
        disabledReason={treeDirectionDisabledReason}
        onChange={onTreeDirectionChange}
      />
      <LayoutSpacingControl
        layoutMode={layoutMode}
        layoutSpacing={layoutSpacing}
        disabled={layoutSpacingDisabled}
        selectionActive={selectionActiveForSpacing}
        onChange={onLayoutSpacingChange}
      />
      <SelectionAlignMenu
        layoutMode={layoutMode}
        selectionActive={selectionLayoutActive}
        disabled={selectionLayoutDisabled}
        onAlign={onAlign}
        onDistribute={onDistribute}
      />
      <SnapGridControl
        layoutMode={layoutMode}
        selectionActive={selectionActiveForSpacing}
        prefs={snapPrefs}
        onEnabledChange={onSnapEnabledChange}
        onShowGridChange={onSnapShowGridChange}
        onGridStepChange={onSnapGridStepChange}
      />
      <LockControls
        selectionActive={lockControlsActive}
        nodeLocked={nodeLocked}
        onToggleLock={onToggleNodeLock}
        onLockSubtree={onLockSubtree}
        onUnlockSubtree={onUnlockSubtree}
      />
      <LabelTextStyleControl
        visible={labelTextStyleVisible}
        disabled={labelTextStyleDisabled}
        fontSize={labelFontSize}
        bold={labelBold}
        underline={labelUnderline}
        onFontSizeChange={onLabelFontSizeChange}
        onToggleBold={onToggleLabelBold}
        onToggleUnderline={onToggleLabelUnderline}
      />
    </div>
  );
}
