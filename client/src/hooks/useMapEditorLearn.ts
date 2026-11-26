"use client";

import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import type { LearnLabelDisplayContext } from "@/domain/map/mapLearnMode";
import {
  learnGenerateBlockedMessage,
  learnGenerateMutationOutcomeMessage,
  learnResetBlockedMessage,
  learnRevealMutationOutcomeMessage,
  learnResetMutationOutcomeMessage,
  learnStartBlockedMessage,
  MAP_LEARN_MESSAGES,
  resolveLearnGenerateBlocked,
  resolveLearnResetBlocked,
  resolveLearnStartBlocked,
  type LearnMutationGuardInput,
  type LearnSelectionGuardInput,
} from "@/domain/map/mapLearnGuards";
import { isLearnStartBlockedByVoice, MAP_VOICE_MESSAGES } from "@/domain/map/mapVoiceGuards";
import type { ConflictState } from "@/domain/mapLibrary/mapConflict";
import type { LearnMutationOutcome } from "@/hooks/useMapLearnActions";
import { useMapLearnMode } from "@/hooks/useMapLearnMode";
import { useLearnReviewCardsKeyboard } from "@/hooks/useLearnReviewCardsKeyboard";
import { useRevisionScopedNotice } from "@/hooks/useRevisionScopedNotice";
import type { MapLearnState } from "@/types/mapLearn";

export type UseMapEditorLearnOptions = {
  learn: MapLearnState | undefined;
  documentRevision: number;
  playingPresentation: boolean;
  storageMode: "persistent" | "protected";
  conflictState: ConflictState;
  selectedNodeId: number | null;
  selectedNodeIds: readonly number[];
  revealLearnNode: (
    nodeId: number,
    guard: LearnSelectionGuardInput & { revealedNodeIds: ReadonlySet<number> },
  ) => LearnMutationOutcome;
  resetLearnProgress: (guard: LearnMutationGuardInput) => LearnMutationOutcome;
  generateLearnReviewCards: (guard: LearnMutationGuardInput) => LearnMutationOutcome;
  selectNode: (id: number | null) => void;
  voiceListening?: boolean;
};

export type UseMapEditorLearnReturn = {
  learnMode: ReturnType<typeof useMapLearnMode>;
  learningActive: boolean;
  learnModeButtonRef: RefObject<HTMLButtonElement | null>;
  learnNotice: ReturnType<typeof useRevisionScopedNotice>["notice"];
  learnDisplay: LearnLabelDisplayContext;
  learnStartBlockedReason: string | null;
  learnResetBlockedReason: string | null;
  learnGenerateBlockedReason: string | null;
  reviewCards: NonNullable<MapLearnState["cards"]>;
  handleToggleLearnMode: () => void;
  handleConfirmLearnReset: () => void;
  handleSelectNodeWithLearn: (id: number | null) => void;
  handleGenerateLearnReviewCards: () => boolean;
  handleOpenLearnReviewCards: () => boolean;
  attemptRevealLearnNode: (nodeId: number) => boolean;
  publishPresentationBlockedDuringLearn: () => void;
  startLearnFromPalette: () => boolean;
  endLearnFromPalette: () => boolean;
};

/** MapEditor 内の学習モード配線（開示・復習カード・通知・キーボード・パレット入口） */
export function useMapEditorLearn({
  learn,
  documentRevision,
  playingPresentation,
  storageMode,
  conflictState,
  selectedNodeId,
  selectedNodeIds,
  revealLearnNode,
  resetLearnProgress,
  generateLearnReviewCards,
  selectNode,
  voiceListening = false,
}: UseMapEditorLearnOptions): UseMapEditorLearnReturn {
  const isProtectedMode = storageMode === "protected";
  const hasMapConflict = conflictState === "conflict";
  const isMapExternallyDeleted = conflictState === "externallyDeleted";
  const learnMode = useMapLearnMode({
    playingPresentation,
    isProtectedMode,
    hasConflict: hasMapConflict,
    isExternallyDeleted: isMapExternallyDeleted,
  });
  const { learningActive } = learnMode;
  const learnModeButtonRef = useRef<HTMLButtonElement>(null);
  const { notice: learnNotice, publishNotice: publishLearnNotice, clearNotice: clearLearnNotice } =
    useRevisionScopedNotice(documentRevision);
  const revealedNodeIdsSet = useMemo(
    () => new Set(learn?.revealedNodeIds ?? []),
    [learn?.revealedNodeIds],
  );
  const learnDisplay = useMemo(
    () => ({ learningActive, revealedNodeIds: revealedNodeIdsSet }),
    [learningActive, revealedNodeIdsSet],
  );
  const learnSessionGuard = useMemo(() => ({
    learningActive,
    playingPresentation,
    selectedNodeIds,
    isProtectedMode,
    hasConflict: hasMapConflict,
    isExternallyDeleted: isMapExternallyDeleted,
  }), [
    hasMapConflict,
    isMapExternallyDeleted,
    isProtectedMode,
    learningActive,
    playingPresentation,
    selectedNodeIds,
  ]);
  const startWithNotice = useCallback((): boolean => {
    if (isLearnStartBlockedByVoice(voiceListening)) {
      publishLearnNotice({
        kind: "status",
        message: MAP_VOICE_MESSAGES.listeningBlock,
      });
      return false;
    }
    const outcome = learnMode.start();
    if (!outcome.ok) {
      publishLearnNotice({
        kind: "status",
        message: learnStartBlockedMessage(outcome.reason),
      });
      return false;
    }
    clearLearnNotice();
    return true;
  }, [clearLearnNotice, learnMode, publishLearnNotice, voiceListening]);
  const endWithNotice = useCallback((): boolean => {
    if (!learnMode.end()) return false;
    clearLearnNotice();
    return true;
  }, [clearLearnNotice, learnMode]);
  const attemptRevealLearnNode = useCallback((nodeId: number) => {
    const outcome = revealLearnNode(nodeId, {
      ...learnSessionGuard,
      revealedNodeIds: revealedNodeIdsSet,
    });
    if (!outcome.ok) {
      publishLearnNotice({
        kind: "status",
        message: learnRevealMutationOutcomeMessage(outcome.reason),
      });
    } else {
      clearLearnNotice();
    }
    return outcome.ok;
  }, [
    clearLearnNotice,
    learnSessionGuard,
    publishLearnNotice,
    revealLearnNode,
    revealedNodeIdsSet,
  ]);
  const handleToggleLearnMode = useCallback(() => {
    if (learningActive) {
      endWithNotice();
      return;
    }
    startWithNotice();
  }, [endWithNotice, learningActive, startWithNotice]);
  const handleConfirmLearnReset = useCallback(() => {
    const outcome = resetLearnProgress(learnSessionGuard);
    learnMode.closeResetDialog();
    if (!outcome.ok) {
      publishLearnNotice({
        kind: "status",
        message: learnResetMutationOutcomeMessage(outcome.reason),
      });
    } else {
      clearLearnNotice();
    }
  }, [clearLearnNotice, learnMode, learnSessionGuard, publishLearnNotice, resetLearnProgress]);
  const handleSelectNodeWithLearn = useCallback((id: number | null) => {
    if (id !== null && learningActive && selectedNodeId === id && selectedNodeIds.length === 1) {
      attemptRevealLearnNode(id);
    }
    selectNode(id);
  }, [attemptRevealLearnNode, learningActive, selectNode, selectedNodeId, selectedNodeIds.length]);
  const learnStartBlockedReason = useMemo(() => {
    if (isLearnStartBlockedByVoice(voiceListening)) {
      return MAP_VOICE_MESSAGES.listeningBlock;
    }
    const blocked = resolveLearnStartBlocked({
      learningActive,
      playingPresentation,
      isProtectedMode,
      hasConflict: hasMapConflict,
      isExternallyDeleted: isMapExternallyDeleted,
    });
    return blocked === null ? null : learnStartBlockedMessage(blocked);
  }, [hasMapConflict, isMapExternallyDeleted, isProtectedMode, learningActive, playingPresentation, voiceListening]);
  const learnResetBlockedReason = useMemo(() => {
    const blocked = resolveLearnResetBlocked(learnSessionGuard);
    return blocked === null ? null : learnResetBlockedMessage(blocked);
  }, [learnSessionGuard]);
  const learnGenerateBlockedReason = useMemo(() => {
    const blocked = resolveLearnGenerateBlocked(learnSessionGuard);
    if (blocked === null) return null;
    return learnGenerateBlockedMessage(blocked);
  }, [learnSessionGuard]);
  const reviewCards = useMemo(() => learn?.cards ?? [], [learn?.cards]);
  const handleGenerateLearnReviewCards = useCallback(() => {
    const outcome = generateLearnReviewCards(learnSessionGuard);
    if (!outcome.ok) {
      publishLearnNotice({
        kind: "status",
        message: learnGenerateMutationOutcomeMessage(outcome.reason),
      });
      return false;
    }
    clearLearnNotice();
    return true;
  }, [clearLearnNotice, generateLearnReviewCards, learnSessionGuard, publishLearnNotice]);
  const handleOpenLearnReviewCards = useCallback(() => {
    if (!learnMode.openReviewCardsPanel()) {
      publishLearnNotice({
        kind: "status",
        message: MAP_LEARN_MESSAGES.notLearning,
      });
      return false;
    }
    return true;
  }, [learnMode, publishLearnNotice]);
  useEffect(() => {
    learnMode.syncReviewCardsDeck(learn?.cards);
  }, [learn?.cards, learnMode]);
  useLearnReviewCardsKeyboard({
    enabled: learnMode.reviewCardsPanelOpen && reviewCards.length > 0,
    onFlip: learnMode.flipReviewCard,
    onPrevious: () => learnMode.goReviewCardPrevious(reviewCards.length),
    onNext: () => learnMode.goReviewCardNext(reviewCards.length),
  });
  const learnNoticeSelectionKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const selectionKey = `${selectedNodeId}:${selectedNodeIds.join(",")}`;
    if (!learningActive) {
      learnNoticeSelectionKeyRef.current = selectionKey;
      return;
    }
    if (learnNoticeSelectionKeyRef.current === selectionKey) return;
    learnNoticeSelectionKeyRef.current = selectionKey;
    clearLearnNotice();
  }, [clearLearnNotice, learningActive, selectedNodeId, selectedNodeIds]);
  const publishPresentationBlockedDuringLearn = useCallback(() => {
    publishLearnNotice({
      kind: "status",
      message: MAP_LEARN_MESSAGES.presentationDuringLearn,
    });
  }, [publishLearnNotice]);

  return {
    learnMode,
    learningActive,
    learnModeButtonRef,
    learnNotice,
    learnDisplay,
    learnStartBlockedReason,
    learnResetBlockedReason,
    learnGenerateBlockedReason,
    reviewCards,
    handleToggleLearnMode,
    handleConfirmLearnReset,
    handleSelectNodeWithLearn,
    handleGenerateLearnReviewCards,
    handleOpenLearnReviewCards,
    attemptRevealLearnNode,
    publishPresentationBlockedDuringLearn,
    startLearnFromPalette: startWithNotice,
    endLearnFromPalette: endWithNotice,
  };
}