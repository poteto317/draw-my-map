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
  readonly canOpenAiBranchSummary: boolean;
  readonly aiBranchSummaryDisabledReason: string | null;
  readonly canOpenAiImportance: boolean;
  readonly aiImportanceDisabledReason: string | null;
  readonly canOpenAiChildCandidates: boolean;
  readonly aiChildCandidatesDisabledReason: string | null;
  readonly canOpenAiClassifyReorder: boolean;
  readonly aiClassifyReorderDisabledReason: string | null;
  readonly canOpenAiDuplicates: boolean;
  readonly aiDuplicatesDisabledReason: string | null;
  readonly canOpenAiMissingPerspectives: boolean;
  readonly aiMissingPerspectivesDisabledReason: string | null;
  readonly canRegisterPart: boolean;
  readonly canInsertPart: boolean;
  readonly canDeletePart: boolean;
  readonly canFocusInMapSearch: boolean;
  readonly canOpenCrossMapSearch: boolean;
  readonly outlineDuplicateIds: boolean;
  readonly outlineInvalidStructure: boolean;
  readonly outlineSelectedVisible: boolean;
  readonly learningActive: boolean;
  readonly playingPresentation: boolean;
  readonly canLearnStart: boolean;
  readonly canLearnEnd: boolean;
  readonly canLearnReset: boolean;
  readonly canLearnGenerateCards: boolean;
  readonly canLearnOpenCards: boolean;
  readonly learnStartDisabledReason: string | null;
  readonly learnResetDisabledReason: string | null;
  readonly learnGenerateDisabledReason: string | null;
  readonly voiceListening: boolean;
  readonly canVoiceInputStart: boolean;
  readonly canVoiceInputStop: boolean;
  readonly voiceStartDisabledReason: string | null;
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
    canOpenAiBranchSummary: input.canOpenAiBranchSummary,
    aiBranchSummaryDisabledReason: input.aiBranchSummaryDisabledReason,
    canOpenAiImportance: input.canOpenAiImportance,
    aiImportanceDisabledReason: input.aiImportanceDisabledReason,
    canOpenAiChildCandidates: input.canOpenAiChildCandidates,
    aiChildCandidatesDisabledReason: input.aiChildCandidatesDisabledReason,
    canOpenAiClassifyReorder: input.canOpenAiClassifyReorder,
    aiClassifyReorderDisabledReason: input.aiClassifyReorderDisabledReason,
    canOpenAiDuplicates: input.canOpenAiDuplicates,
    aiDuplicatesDisabledReason: input.aiDuplicatesDisabledReason,
    canOpenAiMissingPerspectives: input.canOpenAiMissingPerspectives,
    aiMissingPerspectivesDisabledReason: input.aiMissingPerspectivesDisabledReason,
    canRegisterPart: input.canRegisterPart,
    canInsertPart: input.canInsertPart,
    canDeletePart: input.canDeletePart,
    canFocusInMapSearch: input.canFocusInMapSearch,
    canOpenCrossMapSearch: input.canOpenCrossMapSearch,
    // パレット open 中も操作そのものの可否を出す（outlineActions.enabled の偽に畳み込まない）
    outlineCanAddRoot: input.viewMode === "outline" && outlineStructural,
    outlineCanAddRelated:
      input.viewMode === "outline" && outlineStructural && input.outlineSelectedVisible,
    outlineCanEdit:
      input.viewMode === "outline" && !input.outlineDuplicateIds && input.outlineSelectedVisible,
    learningActive: input.learningActive,
    playingPresentation: input.playingPresentation,
    canLearnStart: input.canLearnStart,
    canLearnEnd: input.canLearnEnd,
    canLearnReset: input.canLearnReset,
    canLearnGenerateCards: input.canLearnGenerateCards,
    canLearnOpenCards: input.canLearnOpenCards,
    learnStartDisabledReason: input.learnStartDisabledReason,
    learnResetDisabledReason: input.learnResetDisabledReason,
    learnGenerateDisabledReason: input.learnGenerateDisabledReason,
    voiceListening: input.voiceListening,
    canVoiceInputStart: input.canVoiceInputStart,
    canVoiceInputStop: input.canVoiceInputStop,
    voiceStartDisabledReason: input.voiceStartDisabledReason,
  };
}
