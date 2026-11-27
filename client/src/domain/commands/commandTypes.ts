export type CommandId = string;

export type CommandCategoryId = "view" | "edit" | "search" | "outline" | "io" | "library";

export type CommandDefinition = {
  readonly id: CommandId;
  readonly categoryId: CommandCategoryId;
  readonly categoryLabel: string;
  readonly label: string;
  readonly aliases: readonly string[];
  readonly opensDialog: boolean;
  readonly requiredInV1: boolean;
};

export type CommandAvailability = {
  readonly enabled: boolean;
  readonly modeMismatch: boolean;
  readonly disabledReason: string | null;
};

/**
 * 保護モード・競合・外部削除はフィールドを明示する（can* に畳み込まない）。
 * 各 can* はヘッダー／既存入口と同趣旨の「操作そのものの可否」。
 * resolveCommandAvailability が isProtectedMode / hasConflict / isExternallyDeleted
 * を見て enabled=false + disabledReason を付与する。
 */
export type CommandAvailabilityContext = {
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
  readonly outlineCanAddRoot: boolean;
  readonly outlineCanAddRelated: boolean;
  readonly outlineCanEdit: boolean;
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
  /** P36-E18b パレット MUTATING 一括。非 null なら一括系コマンドを拒否 */
  readonly collabBulkBlockedReason: string | null;
};

export type FilteredCommand = {
  readonly definition: CommandDefinition;
  readonly availability: CommandAvailability;
  readonly displayLabel: string;
};

export type FilterCommandCatalogResult = {
  readonly items: readonly FilteredCommand[];
  readonly overflowCount: number;
};
