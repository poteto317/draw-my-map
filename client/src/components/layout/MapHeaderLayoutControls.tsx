"use client";

import { LayoutSpacingControl } from "@/components/layout/LayoutSpacingControl";
import { LockControls } from "@/components/layout/LockControls";
import { SelectionAlignMenu } from "@/components/layout/SelectionAlignMenu";
import { SnapGridControl } from "@/components/layout/SnapGridControl";
import { TreeDirectionControl } from "@/components/layout/TreeDirectionControl";
import type { LayoutSnapPrefs } from "@/domain/nodes/snapGrid";
import type { SelectionLayoutActionOutcome } from "@/hooks/useSelectionLayoutActions";
import type { SelectionAlignOp } from "@/domain/nodes/selectionAlign";
import type { SelectionDistributeAxis } from "@/domain/nodes/selectionDistribute";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import type { LayoutSpacing } from "@/types/layoutSpacing";
import type { NodeMapState } from "@/types/nodeMapState";
import type { TreeDirection } from "@/types/treeDirection";

export type MapHeaderLayoutControlsProps = {
  layoutMode: NodeLayoutMode;
  treeDirection: NodeMapState["treeDirection"];
  layoutSpacing: NodeMapState["layoutSpacing"];
  selectionActiveForSpacing: boolean;
  selectionLayoutActive: boolean;
  selectionLayoutDisabled: boolean;
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
};

export function MapHeaderLayoutControls({
  layoutMode,
  treeDirection,
  layoutSpacing,
  selectionActiveForSpacing,
  selectionLayoutActive,
  selectionLayoutDisabled,
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
}: MapHeaderLayoutControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <TreeDirectionControl
        layoutMode={layoutMode}
        treeDirection={treeDirection}
        onChange={onTreeDirectionChange}
      />
      <LayoutSpacingControl
        layoutMode={layoutMode}
        layoutSpacing={layoutSpacing}
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
    </div>
  );
}