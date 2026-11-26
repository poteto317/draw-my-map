import { isDocumentBlocked, type DocumentEditGuardInput } from "@/domain/map/mapDocumentEditGuards";

export type LearnSessionGuardInput = {
  readonly learningActive: boolean;
  readonly playingPresentation: boolean;
};

export type LearnSelectionGuardInput = LearnSessionGuardInput & {
  readonly selectedNodeIds: readonly number[];
};

export type LearnMutationGuardInput = LearnSelectionGuardInput & DocumentEditGuardInput;

export const MAP_LEARN_MESSAGES = {
  presentation: "プレゼン再生中は学習を開始できません",
  alreadyLearning: "すでに学習モードです",
  notLearning: "学習モード中のみ実行できます",
  selectOne: "1 件のノードを選んでください",
  alreadyRevealed: "すでに開示済みです",
  protected: "保護モードのため実行できません",
  conflict: "競合中のため実行できません",
  externallyDeleted: "マップが外部で削除されているため実行できません",
  alreadyEnded: "学習モードは終了しています",
  playingPresentationBlock: "プレゼン再生中は使えません",
  learningBlock: "学習モード中は使えません",
  presentationDuringLearn: "学習モード中はプレゼンを開始できません",
  noReviewCards: "復習カードを作れる親子またはメモがありません",
  revealPlacementFailed: "開示を保存できませんでした",
  resetPlacementFailed: "進捗をリセットできません",
  generatePlacementFailed: "復習カードを保存できませんでした",
} as const;

export type LearnMutationPlacementKind = "reveal" | "reset" | "generate";

export function learnMutationPlacementFailedMessage(kind: LearnMutationPlacementKind): string {
  switch (kind) {
    case "reveal":
      return MAP_LEARN_MESSAGES.revealPlacementFailed;
    case "reset":
      return MAP_LEARN_MESSAGES.resetPlacementFailed;
    case "generate":
      return MAP_LEARN_MESSAGES.generatePlacementFailed;
    default: {
      const neverKind: never = kind;
      return neverKind;
    }
  }
}

export type LearnStartFailureReason = "presentation" | "already-learning" | "conflict" | "externally-deleted";
export type LearnEndFailureReason = "already-ended";
export type LearnRevealFailureReason =
  | "not-learning"
  | "no-selection"
  | "multi-selection"
  | "already-revealed"
  | "node-missing";
export type LearnResetFailureReason =
  | "not-learning"
  | "protected"
  | "conflict"
  | "externally-deleted";

export type LearnGenerateFailureReason =
  | LearnResetFailureReason
  | "no-cards";

export type LearnMutationFailureReason =
  | LearnStartFailureReason
  | LearnEndFailureReason
  | LearnRevealFailureReason
  | LearnResetFailureReason
  | LearnGenerateFailureReason
  | "placement-failed";

export function resolveLearnStartBlocked(
  input: LearnSessionGuardInput & DocumentEditGuardInput,
): LearnStartFailureReason | null {
  if (input.isExternallyDeleted) return "externally-deleted";
  if (input.hasConflict) return "conflict";
  if (input.playingPresentation) return "presentation";
  if (input.learningActive) return "already-learning";
  return null;
}

export function resolveLearnEndBlocked(input: LearnSessionGuardInput): LearnEndFailureReason | null {
  if (!input.learningActive) return "already-ended";
  return null;
}

export function resolveLearnRevealBlocked(
  input: LearnSelectionGuardInput,
  nodeId: number,
  revealedNodeIds: ReadonlySet<number>,
): LearnRevealFailureReason | null {
  if (!input.learningActive) return "not-learning";
  if (input.selectedNodeIds.length !== 1) {
    return input.selectedNodeIds.length === 0 ? "no-selection" : "multi-selection";
  }
  if (input.selectedNodeIds[0] !== nodeId) return "no-selection";
  if (revealedNodeIds.has(nodeId)) return "already-revealed";
  return null;
}

export function resolveLearnResetBlocked(
  input: LearnMutationGuardInput,
): LearnResetFailureReason | null {
  if (input.isExternallyDeleted) return "externally-deleted";
  if (input.hasConflict) return "conflict";
  if (!input.learningActive) return "not-learning";
  if (input.isProtectedMode) return "protected";
  return null;
}

export function resolveLearnGenerateBlocked(
  input: LearnMutationGuardInput,
): LearnResetFailureReason | null {
  return resolveLearnResetBlocked(input);
}

export function learnRevealBlockedMessage(reason: LearnRevealFailureReason): string {
  switch (reason) {
    case "not-learning":
      return MAP_LEARN_MESSAGES.notLearning;
    case "no-selection":
    case "multi-selection":
      return MAP_LEARN_MESSAGES.selectOne;
    case "already-revealed":
      return MAP_LEARN_MESSAGES.alreadyRevealed;
    case "node-missing":
      return MAP_LEARN_MESSAGES.selectOne;
    default: {
      const neverReason: never = reason;
      return neverReason;
    }
  }
}

export function learnStartBlockedMessage(reason: LearnStartFailureReason): string {
  switch (reason) {
    case "presentation":
      return MAP_LEARN_MESSAGES.presentation;
    case "already-learning":
      return MAP_LEARN_MESSAGES.alreadyLearning;
    case "conflict":
      return MAP_LEARN_MESSAGES.conflict;
    case "externally-deleted":
      return MAP_LEARN_MESSAGES.externallyDeleted;
    default: {
      const neverReason: never = reason;
      return neverReason;
    }
  }
}

export function learnGenerateBlockedMessage(reason: LearnGenerateFailureReason): string {
  if (reason === "no-cards") return MAP_LEARN_MESSAGES.noReviewCards;
  return learnResetBlockedMessage(reason);
}

export function learnRevealMutationOutcomeMessage(reason: LearnMutationFailureReason): string {
  if (reason === "placement-failed") return learnMutationPlacementFailedMessage("reveal");
  if (
    reason === "not-learning"
    || reason === "no-selection"
    || reason === "multi-selection"
    || reason === "already-revealed"
    || reason === "node-missing"
  ) {
    return learnRevealBlockedMessage(reason);
  }
  return learnRevealBlockedMessage("no-selection");
}

export function learnResetMutationOutcomeMessage(reason: LearnMutationFailureReason): string {
  if (reason === "placement-failed") return learnMutationPlacementFailedMessage("reset");
  if (
    reason === "not-learning"
    || reason === "protected"
    || reason === "conflict"
    || reason === "externally-deleted"
  ) {
    return learnResetBlockedMessage(reason);
  }
  return learnResetBlockedMessage("not-learning");
}

export function learnGenerateMutationOutcomeMessage(reason: LearnMutationFailureReason): string {
  if (reason === "placement-failed") return learnMutationPlacementFailedMessage("generate");
  if (reason === "no-cards") return learnGenerateBlockedMessage("no-cards");
  if (
    reason === "not-learning"
    || reason === "protected"
    || reason === "conflict"
    || reason === "externally-deleted"
  ) {
    return learnGenerateBlockedMessage(reason);
  }
  return learnGenerateBlockedMessage("not-learning");
}

export function learnResetBlockedMessage(reason: LearnResetFailureReason): string {
  switch (reason) {
    case "not-learning":
      return MAP_LEARN_MESSAGES.notLearning;
    case "protected":
      return MAP_LEARN_MESSAGES.protected;
    case "conflict":
      return MAP_LEARN_MESSAGES.conflict;
    case "externally-deleted":
      return MAP_LEARN_MESSAGES.externallyDeleted;
    default: {
      const neverReason: never = reason;
      return neverReason;
    }
  }
}

export function isLearnStructureEditBlocked(learningActive: boolean): boolean {
  return learningActive;
}

export function isPresentationStartBlockedByLearn(learningActive: boolean): boolean {
  return learningActive;
}

export function isAiAssistBlockedByLearn(learningActive: boolean): boolean {
  return learningActive;
}

export function isLearnDocumentMutationBlocked(input: DocumentEditGuardInput): boolean {
  return isDocumentBlocked(input);
}