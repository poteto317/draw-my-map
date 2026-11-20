import type { CommandAvailabilityContext } from "@/domain/commands/commandTypes";

/** MapEditor 状態フラグからパレット可否コンテキストを組み立てる（純関数） */
export type CommandAvailabilityContextInput = {
  readonly viewMode: "map" | "outline";
  readonly selectedNodeId: number | null;
  readonly focusing: boolean;
  readonly isProtectedMode: boolean;
  readonly hasConflict: boolean;
  readonly isExternallyDeleted: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly canFitAll: boolean;
  readonly canFitSelection: boolean;
  readonly canFocusBranch: boolean;
  readonly canExpandSubtree: boolean;
  readonly canCollapseSubtree: boolean;
  readonly canDuplicate: boolean;
  readonly canDeleteNodeOnly: boolean;
  readonly canInsertParent: boolean;
  readonly canMoveSiblingUp: boolean;
  readonly canMoveSiblingDown: boolean;
  readonly canIndent: boolean;
  readonly canOutdent: boolean;
  readonly canOpenLabelReplace: boolean;
  readonly canOpenBranchMove: boolean;
  readonly canOpenNodeSplit: boolean;
  readonly nodeSplitDisabledReason: string | null;
  readonly canOpenNodeMerge: boolean;
  readonly nodeMergeDisabledReason: string | null;
  readonly canFocusInMapSearch: boolean;
  readonly canOpenCrossMapSearch: boolean;
  readonly outlineDuplicateIds: boolean;
  readonly outlineInvalidStructure: boolean;
  readonly outlineSelectedVisible: boolean;
};

export function buildCommandAvailabilityContext(
  input: CommandAvailabilityContextInput,
): CommandAvailabilityContext {
  const outlineStructural = !input.outlineDuplicateIds && !input.outlineInvalidStructure;
  return {
    viewMode: input.viewMode,
    selectedNodeId: input.selectedNodeId,
    focusing: input.focusing,
    isProtectedMode: input.isProtectedMode,
    hasConflict: input.hasConflict,
    isExternallyDeleted: input.isExternallyDeleted,
    canUndo: input.canUndo,
    canRedo: input.canRedo,
    canFitAll: input.canFitAll,
    canFitSelection: input.canFitSelection,
    canFocusBranch: input.canFocusBranch,
    canExpandSubtree: input.canExpandSubtree,
    canCollapseSubtree: input.canCollapseSubtree,
    canDuplicate: input.canDuplicate,
    canDeleteNodeOnly: input.canDeleteNodeOnly,
    canInsertParent: input.canInsertParent,
    canMoveSiblingUp: input.canMoveSiblingUp,
    canMoveSiblingDown: input.canMoveSiblingDown,
    canIndent: input.canIndent,
    canOutdent: input.canOutdent,
    canOpenLabelReplace: input.canOpenLabelReplace,
    canOpenBranchMove: input.canOpenBranchMove,
    canOpenNodeSplit: input.canOpenNodeSplit,
    nodeSplitDisabledReason: input.nodeSplitDisabledReason,
    canOpenNodeMerge: input.canOpenNodeMerge,
    nodeMergeDisabledReason: input.nodeMergeDisabledReason,
    canFocusInMapSearch: input.canFocusInMapSearch,
    canOpenCrossMapSearch: input.canOpenCrossMapSearch,
    // パレット open 中も操作そのものの可否を出す（outlineActions.enabled の偽に畳み込まない）
    outlineCanAddRoot: input.viewMode === "outline" && outlineStructural,
    outlineCanAddRelated:
      input.viewMode === "outline" && outlineStructural && input.outlineSelectedVisible,
    outlineCanEdit:
      input.viewMode === "outline" && !input.outlineDuplicateIds && input.outlineSelectedVisible,
  };
}
