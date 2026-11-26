import { useCallback } from "react";
import {
  applyLearnToState,
  resetLearnProgressState,
  revealNodeInLearn,
} from "@/domain/map/mapLearnMode";
import { generateReviewCards } from "@/domain/map/mapReviewCards";
import {
  resolveLearnGenerateBlocked,
  resolveLearnResetBlocked,
  resolveLearnRevealBlocked,
  type LearnMutationFailureReason,
  type LearnMutationGuardInput,
  type LearnSelectionGuardInput,
} from "@/domain/map/mapLearnGuards";
import type { StateChange } from "@/hooks/useNodeLayoutState";
import type { MapReviewCard } from "@/types/mapLearn";
import type { Node } from "@/types/node";

export type LearnMutationOutcome =
  | { ok: true }
  | { ok: false; reason: LearnMutationFailureReason };

type UseMapLearnActionsArgs = {
  applyStateChangeRaw: (update: StateChange) => boolean;
};

export function useMapLearnActions({ applyStateChangeRaw }: UseMapLearnActionsArgs) {
  const revealLearnNode = useCallback((
    nodeId: number,
    guard: LearnSelectionGuardInput & { revealedNodeIds: ReadonlySet<number> },
  ): LearnMutationOutcome => {
    const blocked = resolveLearnRevealBlocked(guard, nodeId, guard.revealedNodeIds);
    if (blocked !== null) return { ok: false, reason: blocked };
    let outcome: LearnMutationOutcome = { ok: false, reason: "already-revealed" };
    const applied = applyStateChangeRaw((current) => {
      const nextLearn = revealNodeInLearn(current, nodeId);
      if (nextLearn === null) {
        outcome = { ok: false, reason: "already-revealed" };
        return null;
      }
      outcome = { ok: true };
      return applyLearnToState(current, nextLearn);
    });
    if (!applied && outcome.ok) return { ok: false, reason: "placement-failed" };
    return outcome;
  }, [applyStateChangeRaw]);

  const resetLearnProgress = useCallback((
    guard: LearnMutationGuardInput,
  ): LearnMutationOutcome => {
    const blocked = resolveLearnResetBlocked(guard);
    if (blocked !== null) return { ok: false, reason: blocked };
    let outcome: LearnMutationOutcome = { ok: true };
    const applied = applyStateChangeRaw((current) => {
      const nextLearn = resetLearnProgressState(current);
      outcome = { ok: true };
      return applyLearnToState(current, nextLearn);
    });
    if (!applied && outcome.ok) return { ok: false, reason: "placement-failed" };
    return outcome;
  }, [applyStateChangeRaw]);

  const replaceLearnCards = useCallback((cards: readonly MapReviewCard[]): LearnMutationOutcome => {
    if (cards.length === 0) return { ok: false, reason: "no-cards" };
    let outcome: LearnMutationOutcome = { ok: true };
    const applied = applyStateChangeRaw((current) => {
      const base = current.learn ?? {
        version: 1 as const,
        revealedNodeIds: [] as readonly number[],
      };
      const nextLearn = { ...base, cards: [...cards] };
      outcome = { ok: true };
      return applyLearnToState(current, nextLearn);
    });
    if (!applied && outcome.ok) return { ok: false, reason: "placement-failed" };
    return outcome;
  }, [applyStateChangeRaw]);

  const generateLearnReviewCards = useCallback((
    nodes: readonly Node[],
    guard: LearnMutationGuardInput,
  ): LearnMutationOutcome => {
    const blocked = resolveLearnGenerateBlocked(guard);
    if (blocked !== null) return { ok: false, reason: blocked };
    const cards = generateReviewCards(nodes);
    return replaceLearnCards(cards);
  }, [replaceLearnCards]);

  return {
    revealLearnNode,
    resetLearnProgress,
    replaceLearnCards,
    generateLearnReviewCards,
  };
}