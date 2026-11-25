import { useCallback } from "react";
import {
  applyTourToState,
  planAddTourStep,
  planCreateTour,
  planOverwriteTourStepSnapshot,
  planRemoveTour,
  planRemoveTourStep,
  planReorderTourSteps,
  planSetTourStepCaption,
  planSetTourTitle,
  type TourMutationFailureReason,
} from "@/domain/map/mapTourMutation";
import type { StateChange } from "@/hooks/useNodeLayoutState";
import type { MapViewSnapshot } from "@/types/mapViewSnapshot";

export type CreateTourOutcome =
  | { ok: true }
  | { ok: false; reason: TourMutationFailureReason };

export type TourStepOutcome =
  | { ok: true; stepId?: string }
  | { ok: false; reason: TourMutationFailureReason };

export type TourMutationOutcome =
  | { ok: true }
  | { ok: false; reason: TourMutationFailureReason };

type UseMapTourActionsArgs = {
  applyStateChangeRaw: (update: StateChange) => boolean;
  newStepId: () => string;
};

export function useMapTourActions({
  applyStateChangeRaw,
  newStepId,
}: UseMapTourActionsArgs) {
  const createTour = useCallback((title: string): CreateTourOutcome => {
    let outcome: CreateTourOutcome = { ok: false, reason: "invalid-title" };
    const applied = applyStateChangeRaw((current) => {
      if (current.tour !== undefined) {
        outcome = { ok: false, reason: "already-exists" };
        return null;
      }
      const planned = planCreateTour(title);
      if (!planned.ok) {
        outcome = planned;
        return null;
      }
      outcome = { ok: true };
      return applyTourToState(current, planned.tour);
    });
    if (!applied && outcome.ok) return { ok: false, reason: "placement-failed" };
    return outcome;
  }, [applyStateChangeRaw]);

  const removeTour = useCallback((): TourMutationOutcome => {
    let outcome: TourMutationOutcome = { ok: false, reason: "missing-tour" };
    const applied = applyStateChangeRaw((current) => {
      const planned = planRemoveTour(current);
      if (!planned.ok) {
        outcome = planned;
        return null;
      }
      outcome = { ok: true };
      return planned.state;
    });
    if (!applied && outcome.ok) return { ok: false, reason: "placement-failed" };
    return outcome;
  }, [applyStateChangeRaw]);

  const setTourTitle = useCallback((title: string): TourMutationOutcome => {
    let outcome: TourMutationOutcome = { ok: false, reason: "missing-tour" };
    const applied = applyStateChangeRaw((current) => {
      const planned = planSetTourTitle(current, title);
      if (!planned.ok) {
        outcome = planned;
        return null;
      }
      outcome = { ok: true };
      return applyTourToState(current, planned.tour);
    });
    if (!applied && outcome.ok) return { ok: false, reason: "placement-failed" };
    return outcome;
  }, [applyStateChangeRaw]);

  const addTourStep = useCallback((
    snapshot: MapViewSnapshot,
    stepId?: string,
  ): TourStepOutcome => {
    let outcome: TourStepOutcome = { ok: false, reason: "missing-tour" };
    const id = stepId ?? newStepId();
    const applied = applyStateChangeRaw((current) => {
      const planned = planAddTourStep(current, snapshot, id);
      if (!planned.ok) {
        outcome = planned;
        return null;
      }
      outcome = { ok: true, stepId: planned.step.id };
      return applyTourToState(current, planned.tour);
    });
    if (!applied && outcome.ok) return { ok: false, reason: "placement-failed" };
    return outcome;
  }, [applyStateChangeRaw, newStepId]);

  const removeTourStep = useCallback((stepId: string): TourMutationOutcome => {
    let outcome: TourMutationOutcome = { ok: false, reason: "missing-tour" };
    const applied = applyStateChangeRaw((current) => {
      const planned = planRemoveTourStep(current, stepId);
      if (!planned.ok) {
        outcome = planned;
        return null;
      }
      outcome = { ok: true };
      return applyTourToState(current, planned.tour);
    });
    if (!applied && outcome.ok) return { ok: false, reason: "placement-failed" };
    return outcome;
  }, [applyStateChangeRaw]);

  const reorderTourStep = useCallback((
    fromIndex: number,
    toIndex: number,
  ): TourMutationOutcome => {
    let outcome: TourMutationOutcome = { ok: false, reason: "missing-tour" };
    const applied = applyStateChangeRaw((current) => {
      const planned = planReorderTourSteps(current, fromIndex, toIndex);
      if (!planned.ok) {
        outcome = planned;
        return null;
      }
      outcome = { ok: true };
      return applyTourToState(current, planned.tour);
    });
    if (!applied && outcome.ok) return { ok: false, reason: "placement-failed" };
    return outcome;
  }, [applyStateChangeRaw]);

  const overwriteTourStepSnapshot = useCallback((
    stepId: string,
    snapshot: MapViewSnapshot,
  ): TourMutationOutcome => {
    let outcome: TourMutationOutcome = { ok: false, reason: "missing-tour" };
    const applied = applyStateChangeRaw((current) => {
      const planned = planOverwriteTourStepSnapshot(current, stepId, snapshot);
      if (!planned.ok) {
        outcome = planned;
        return null;
      }
      outcome = { ok: true };
      return applyTourToState(current, planned.tour);
    });
    if (!applied && outcome.ok) return { ok: false, reason: "placement-failed" };
    return outcome;
  }, [applyStateChangeRaw]);

  const setTourStepCaption = useCallback((
    stepId: string,
    caption: string,
  ): TourMutationOutcome => {
    let outcome: TourMutationOutcome = { ok: false, reason: "missing-tour" };
    const applied = applyStateChangeRaw((current) => {
      const planned = planSetTourStepCaption(current, stepId, caption);
      if (!planned.ok) {
        outcome = planned;
        return null;
      }
      outcome = { ok: true };
      return applyTourToState(current, planned.tour);
    });
    if (!applied && outcome.ok) return { ok: false, reason: "placement-failed" };
    return outcome;
  }, [applyStateChangeRaw]);

  return {
    createTour,
    removeTour,
    setTourTitle,
    addTourStep,
    removeTourStep,
    reorderTourStep,
    overwriteTourStepSnapshot,
    setTourStepCaption,
  };
}