"use client";

import { useCallback, useState } from "react";
import type { MapReviewCard } from "@/types/mapLearn";
import {
  resolveLearnStartBlocked,
  resolveLearnEndBlocked,
  type LearnStartFailureReason,
} from "@/domain/map/mapLearnGuards";

export type LearnStartOutcome =
  | { ok: true }
  | { ok: false; reason: LearnStartFailureReason };

export type UseMapLearnModeOptions = {
  playingPresentation: boolean;
  isProtectedMode: boolean;
  hasConflict: boolean;
  isExternallyDeleted: boolean;
};

export function useMapLearnMode({
  playingPresentation,
  isProtectedMode,
  hasConflict,
  isExternallyDeleted,
}: UseMapLearnModeOptions) {
  const [learningActive, setLearningActive] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [reviewCardsPanelOpen, setReviewCardsPanelOpen] = useState(false);
  const [reviewCardIndex, setReviewCardIndex] = useState(0);
  const [reviewCardShowingAnswer, setReviewCardShowingAnswer] = useState(false);

  const start = useCallback((): LearnStartOutcome => {
    const blocked = resolveLearnStartBlocked({
      learningActive,
      playingPresentation,
      isProtectedMode,
      hasConflict,
      isExternallyDeleted,
    });
    if (blocked !== null) return { ok: false, reason: blocked };
    setLearningActive(true);
    return { ok: true };
  }, [hasConflict, isExternallyDeleted, isProtectedMode, learningActive, playingPresentation]);

  const end = useCallback((): boolean => {
    const blocked = resolveLearnEndBlocked({ learningActive, playingPresentation });
    if (blocked !== null) return false;
    setLearningActive(false);
    setResetDialogOpen(false);
    setReviewCardsPanelOpen(false);
    setReviewCardIndex(0);
    setReviewCardShowingAnswer(false);
    return true;
  }, [learningActive, playingPresentation]);

  const openResetDialog = useCallback(() => {
    if (!learningActive) return;
    setResetDialogOpen(true);
  }, [learningActive]);

  const closeResetDialog = useCallback(() => {
    setResetDialogOpen(false);
  }, []);

  const openReviewCardsPanel = useCallback(() => {
    if (!learningActive) return false;
    setReviewCardsPanelOpen(true);
    return true;
  }, [learningActive]);

  const closeReviewCardsPanel = useCallback(() => {
    setReviewCardsPanelOpen(false);
    setReviewCardIndex(0);
    setReviewCardShowingAnswer(false);
  }, []);

  const flipReviewCard = useCallback(() => {
    if (!reviewCardsPanelOpen) return false;
    setReviewCardShowingAnswer((value) => !value);
    return true;
  }, [reviewCardsPanelOpen]);

  const goReviewCardPrevious = useCallback((cardCount: number) => {
    if (!reviewCardsPanelOpen || cardCount <= 0 || reviewCardIndex <= 0) return false;
    setReviewCardIndex(reviewCardIndex - 1);
    setReviewCardShowingAnswer(false);
    return true;
  }, [reviewCardIndex, reviewCardsPanelOpen]);

  const goReviewCardNext = useCallback((cardCount: number) => {
    if (!reviewCardsPanelOpen || cardCount <= 0 || reviewCardIndex >= cardCount - 1) return false;
    setReviewCardIndex(reviewCardIndex + 1);
    setReviewCardShowingAnswer(false);
    return true;
  }, [reviewCardIndex, reviewCardsPanelOpen]);

  const syncReviewCardsDeck = useCallback((cards: readonly MapReviewCard[] | undefined) => {
    const count = cards?.length ?? 0;
    if (count === 0) {
      setReviewCardIndex(0);
      setReviewCardShowingAnswer(false);
      return;
    }
    setReviewCardIndex((index) => Math.min(index, count - 1));
  }, []);

  return {
    learningActive,
    resetDialogOpen,
    reviewCardsPanelOpen,
    reviewCardIndex,
    reviewCardShowingAnswer,
    start,
    end,
    openResetDialog,
    closeResetDialog,
    openReviewCardsPanel,
    closeReviewCardsPanel,
    flipReviewCard,
    goReviewCardPrevious,
    goReviewCardNext,
    syncReviewCardsDeck,
  };
}