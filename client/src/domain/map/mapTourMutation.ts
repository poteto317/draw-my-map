import { createNodeCollapseIndex } from "@/domain/nodes/nodeCollapse";
import { resolveRestoredMapView } from "@/domain/nodes/mapViewSnapshot";
import {
  MAP_TOUR_CAPTION_MAX_CODEPOINTS,
  MAP_TOUR_STEP_MAX,
  MAP_TOUR_TITLE_MAX_CODEPOINTS,
  MAP_TOUR_VERSION,
  type MapTour,
  type MapTourStep,
} from "@/types/mapTour";
import type { MapViewSnapshot } from "@/types/mapViewSnapshot";
import type { NodeMapState } from "@/types/nodeMapState";

export type CreateTourFailureReason = "invalid-title" | "already-exists";
export type TourMutationFailureReason =
  | CreateTourFailureReason
  | "missing-tour"
  | "missing-step"
  | "step-limit"
  | "invalid-snapshot"
  | "invalid-caption"
  | "invalid-index"
  | "noop"
  | "placement-failed";

export type TourMutationResult<T> =
  | { ok: true } & T
  | { ok: false; reason: TourMutationFailureReason };

function codePointLength(text: string): number {
  return Array.from(text).length;
}

export function normalizeEditableTourTitle(title: string): string | null {
  const trimmed = title.trim();
  if (trimmed.length === 0 || codePointLength(trimmed) > MAP_TOUR_TITLE_MAX_CODEPOINTS) return null;
  return trimmed;
}

export function normalizeEditableTourCaption(caption: string): string | undefined {
  const trimmed = caption.trim();
  if (trimmed.length === 0 || codePointLength(trimmed) > MAP_TOUR_CAPTION_MAX_CODEPOINTS) return undefined;
  return trimmed;
}

function normalizeStepId(stepId: string): string | null {
  const id = stepId.trim();
  return id.length > 0 ? id : null;
}

function normalizeSnapshotForTour(
  snapshot: MapViewSnapshot,
  state: NodeMapState,
): MapViewSnapshot | null {
  const index = createNodeCollapseIndex(state.nodes);
  const nodeIdSet = new Set(state.nodes.map((node) => node.id));
  const { normalized } = resolveRestoredMapView(snapshot, state.nodes, index);
  for (const id of normalized.selectedNodeIds) {
    if (!nodeIdSet.has(id)) return null;
  }
  if (normalized.selectedNodeId !== null && !nodeIdSet.has(normalized.selectedNodeId)) return null;
  for (const id of normalized.collapsedNodeIds) {
    if (!nodeIdSet.has(id)) return null;
  }
  if (normalized.focusRootId !== null && !nodeIdSet.has(normalized.focusRootId)) return null;
  return normalized;
}

export function planCreateTour(title: string): TourMutationResult<{ tour: MapTour }> {
  const normalizedTitle = normalizeEditableTourTitle(title);
  if (normalizedTitle === null) return { ok: false, reason: "invalid-title" };
  return {
    ok: true,
    tour: { version: MAP_TOUR_VERSION, title: normalizedTitle, steps: [] },
  };
}

export function planRemoveTour(state: NodeMapState): TourMutationResult<{ state: NodeMapState }> {
  if (state.tour === undefined) return { ok: false, reason: "missing-tour" };
  const rest = { ...state };
  delete rest.tour;
  return { ok: true, state: rest };
}

export function planSetTourTitle(
  state: NodeMapState,
  title: string,
): TourMutationResult<{ tour: MapTour }> {
  if (state.tour === undefined) return { ok: false, reason: "missing-tour" };
  const normalizedTitle = normalizeEditableTourTitle(title);
  if (normalizedTitle === null) return { ok: false, reason: "invalid-title" };
  if (state.tour.title === normalizedTitle) return { ok: false, reason: "noop" };
  return {
    ok: true,
    tour: { ...state.tour, title: normalizedTitle },
  };
}

export function planAddTourStep(
  state: NodeMapState,
  snapshot: MapViewSnapshot,
  newStepId: string,
): TourMutationResult<{ tour: MapTour; step: MapTourStep }> {
  if (state.tour === undefined) return { ok: false, reason: "missing-tour" };
  if (state.tour.steps.length >= MAP_TOUR_STEP_MAX) return { ok: false, reason: "step-limit" };
  const stepId = normalizeStepId(newStepId);
  if (stepId === null) return { ok: false, reason: "invalid-snapshot" };
  if (state.tour.steps.some((step) => step.id === stepId)) return { ok: false, reason: "invalid-snapshot" };
  const normalizedSnapshot = normalizeSnapshotForTour(snapshot, state);
  if (normalizedSnapshot === null) return { ok: false, reason: "invalid-snapshot" };

  const step: MapTourStep = { id: stepId, snapshot: normalizedSnapshot };
  const tour: MapTour = {
    ...state.tour,
    steps: [...state.tour.steps, step],
  };
  return { ok: true, tour, step };
}

export function planRemoveTourStep(
  state: NodeMapState,
  stepId: string,
): TourMutationResult<{ tour: MapTour | undefined }> {
  if (state.tour === undefined) return { ok: false, reason: "missing-tour" };
  const nextSteps = state.tour.steps.filter((step) => step.id !== stepId);
  if (nextSteps.length === state.tour.steps.length) return { ok: false, reason: "missing-step" };
  const tour = nextSteps.length === 0
    ? undefined
    : { ...state.tour, steps: nextSteps };
  return { ok: true, tour };
}

export function planReorderTourSteps(
  state: NodeMapState,
  fromIndex: number,
  toIndex: number,
): TourMutationResult<{ tour: MapTour }> {
  if (state.tour === undefined) return { ok: false, reason: "missing-tour" };
  const { steps } = state.tour;
  if (
    fromIndex < 0
    || toIndex < 0
    || fromIndex >= steps.length
    || toIndex >= steps.length
    || fromIndex === toIndex
  ) {
    return { ok: false, reason: "invalid-index" };
  }
  const reordered = [...steps];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved!);
  return { ok: true, tour: { ...state.tour, steps: reordered } };
}

export function planOverwriteTourStepSnapshot(
  state: NodeMapState,
  stepId: string,
  snapshot: MapViewSnapshot,
): TourMutationResult<{ tour: MapTour }> {
  if (state.tour === undefined) return { ok: false, reason: "missing-tour" };
  const normalizedSnapshot = normalizeSnapshotForTour(snapshot, state);
  if (normalizedSnapshot === null) return { ok: false, reason: "invalid-snapshot" };
  let found = false;
  const nextSteps = state.tour.steps.map((step) => {
    if (step.id !== stepId) return step;
    found = true;
    if (step.snapshot === normalizedSnapshot) return step;
    return { ...step, snapshot: normalizedSnapshot };
  });
  if (!found) return { ok: false, reason: "missing-step" };
  return { ok: true, tour: { ...state.tour, steps: nextSteps } };
}

export function planSetTourStepCaption(
  state: NodeMapState,
  stepId: string,
  caption: string,
): TourMutationResult<{ tour: MapTour }> {
  if (state.tour === undefined) return { ok: false, reason: "missing-tour" };
  const trimmed = caption.trim();
  if (trimmed.length > 0 && codePointLength(trimmed) > MAP_TOUR_CAPTION_MAX_CODEPOINTS) {
    return { ok: false, reason: "invalid-caption" };
  }
  const normalizedCaption = trimmed.length === 0 ? undefined : trimmed;
  let found = false;
  const nextSteps = state.tour.steps.map((step) => {
    if (step.id !== stepId) return step;
    found = true;
    const current = step.caption ?? undefined;
    if (current === normalizedCaption) return step;
    if (normalizedCaption === undefined) {
      const rest = { ...step };
      delete rest.caption;
      return rest;
    }
    return { ...step, caption: normalizedCaption };
  });
  if (!found) return { ok: false, reason: "missing-step" };
  const unchanged = nextSteps.every((step, index) => step === state.tour!.steps[index]);
  if (unchanged) return { ok: false, reason: "noop" };
  return { ok: true, tour: { ...state.tour, steps: nextSteps } };
}

export function applyTourToState(state: NodeMapState, tour: MapTour | undefined): NodeMapState {
  if (tour === undefined) {
    const next = { ...state };
    delete next.tour;
    return next;
  }
  return { ...state, tour };
}