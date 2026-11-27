import { resolveCommandAvailability } from "@/domain/commands/resolveCommandAvailability";
import type { CommandAvailabilityContext } from "@/domain/commands/commandTypes";
import { MAP_VOICE_MESSAGES } from "@/domain/map/mapVoiceGuards";

function base(overrides: Partial<CommandAvailabilityContext> = {}): CommandAvailabilityContext {
  return {
    viewMode: "map",
    selectedNodeId: 1,
    focusing: false,
    isProtectedMode: false,
    hasConflict: false,
    isExternallyDeleted: false,
    canUndo: true,
    canRedo: true,
    canFitAll: true,
    canFitSelection: true,
    canFocusBranch: true,
    canExpandSubtree: true,
    canCollapseSubtree: true,
    canDuplicate: true,
    canDeleteNodeOnly: true,
    canInsertParent: true,
    canMoveSiblingUp: true,
    canMoveSiblingDown: true,
    canIndent: true,
    canOutdent: true,
    canOpenLabelReplace: true,
    canOpenBranchMove: true,
    canOpenNodeSplit: true,
    nodeSplitDisabledReason: null,
    canOpenNodeMerge: true,
    nodeMergeDisabledReason: null,
    canOpenAiBranchSummary: true,
    aiBranchSummaryDisabledReason: null,
    canOpenAiImportance: true,
    aiImportanceDisabledReason: null,
    canOpenAiChildCandidates: true,
    aiChildCandidatesDisabledReason: null,
    canOpenAiClassifyReorder: true,
    aiClassifyReorderDisabledReason: null,
    canOpenAiDuplicates: true,
    aiDuplicatesDisabledReason: null,
    canOpenAiMissingPerspectives: true,
    aiMissingPerspectivesDisabledReason: null,
    canRegisterPart: true,
    canInsertPart: true,
    canDeletePart: true,
    canFocusInMapSearch: true,
    canOpenCrossMapSearch: true,
    outlineCanAddRoot: true,
    outlineCanAddRelated: true,
    outlineCanEdit: true,
    learningActive: false,
    playingPresentation: false,
    canLearnStart: true,
    canLearnEnd: false,
    canLearnReset: false,
    canLearnGenerateCards: false,
    canLearnOpenCards: false,
    learnStartDisabledReason: null,
    learnResetDisabledReason: null,
    learnGenerateDisabledReason: null,
    voiceListening: false,
    canVoiceInputStart: true,
    canVoiceInputStop: false,
    voiceStartDisabledReason: null,
    collabBulkBlockedReason: null,
    ...overrides,
  };
}

describe("resolveCommandAvailability voice", () => {
  it("listening 中は MUTATING を塞ぎ undo/redo と stop は有効", () => {
    const ctx = base({ voiceListening: true, canVoiceInputStop: true });
    expect(resolveCommandAvailability("edit.duplicate-branch", ctx).enabled).toBe(false);
    expect(resolveCommandAvailability("edit.undo", ctx).enabled).toBe(true);
    expect(resolveCommandAvailability("voice-input.stop", ctx).enabled).toBe(true);
  });

  it("voice-input.start はコンテキストの canVoiceInputStart に従う", () => {
    const blocked = base({ canVoiceInputStart: false, voiceStartDisabledReason: MAP_VOICE_MESSAGES.learning });
    expect(resolveCommandAvailability("voice-input.start", blocked).disabledReason).toBe(MAP_VOICE_MESSAGES.learning);
  });
});