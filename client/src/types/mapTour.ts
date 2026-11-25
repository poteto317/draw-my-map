import { isSameMapView, resolveRestoredMapView } from "@/domain/nodes/mapViewSnapshot";
import { createNodeCollapseIndex } from "@/domain/nodes/nodeCollapse";
import { isRecord } from "@/domain/shared/unknownRecord";
import type { MapViewSnapshot } from "@/types/mapViewSnapshot";
import type { Node } from "@/types/node";
import { isValidViewport } from "@/types/viewport";

export const MAP_TOUR_VERSION = 1 as const;
export const MAP_TOUR_TITLE_MAX_CODEPOINTS = 80;
export const MAP_TOUR_CAPTION_MAX_CODEPOINTS = 500;
export const MAP_TOUR_STEP_MAX = 50;

export type MapTourStep = {
  id: string;
  snapshot: MapViewSnapshot;
  caption?: string;
};

export type MapTour = {
  version: typeof MAP_TOUR_VERSION;
  title: string;
  steps: readonly MapTourStep[];
};

function codePointLength(text: string): number {
  return Array.from(text).length;
}

function isNodeIdOrNull(value: unknown): boolean {
  return value === null || Number.isSafeInteger(value);
}

function isNodeIdList(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  for (const id of value) {
    if (!Number.isSafeInteger(id)) return false;
  }
  return true;
}

function isResolutionLevel(value: unknown): value is MapViewSnapshot["resolutionMode"] {
  return value === "high" || value === "medium" || value === "all";
}

function parseSnapshotShape(raw: unknown): MapViewSnapshot | null {
  if (!isRecord(raw)) return null;
  const { viewport, selectedNodeId, selectedNodeIds, focusRootId, collapsedNodeIds, resolutionMode, autoResolutionLevel } = raw;
  if (!isRecord(viewport)) return null;
  const { offsetX, offsetY, scale } = viewport;
  if (
    typeof offsetX !== "number"
    || typeof offsetY !== "number"
    || typeof scale !== "number"
    || !isValidViewport({ offsetX, offsetY, scale })
  ) {
    return null;
  }
  if (
    !isNodeIdOrNull(selectedNodeId)
    || !isNodeIdOrNull(focusRootId)
    || !isNodeIdList(selectedNodeIds)
    || !isNodeIdList(collapsedNodeIds)
    || !isResolutionLevel(autoResolutionLevel)
    || !(resolutionMode === "auto" || isResolutionLevel(resolutionMode))
  ) {
    return null;
  }
  return {
    viewport: { offsetX, offsetY, scale },
    selectedNodeId: selectedNodeId as number | null,
    selectedNodeIds: selectedNodeIds as readonly number[],
    focusRootId: focusRootId as number | null,
    collapsedNodeIds: collapsedNodeIds as readonly number[],
    resolutionMode: resolutionMode as MapViewSnapshot["resolutionMode"],
    autoResolutionLevel: autoResolutionLevel as MapViewSnapshot["autoResolutionLevel"],
  };
}

function normalizeTourTitle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const title = raw.trim();
  if (title.length === 0 || codePointLength(title) > MAP_TOUR_TITLE_MAX_CODEPOINTS) return null;
  return title;
}

function normalizeTourCaption(raw: unknown): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string") return undefined;
  const caption = raw.trim();
  if (caption.length === 0 || codePointLength(caption) > MAP_TOUR_CAPTION_MAX_CODEPOINTS) return undefined;
  return caption;
}

function normalizeStepId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return id.length > 0 ? id : null;
}

function normalizeSnapshot(
  raw: unknown,
  nodes: readonly Node[],
  nodeIdSet: ReadonlySet<number>,
): MapViewSnapshot | null {
  const shape = parseSnapshotShape(raw);
  if (shape === null) return null;
  const index = createNodeCollapseIndex(nodes);
  const { normalized } = resolveRestoredMapView(shape, nodes, index);
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

function parseTourStep(
  raw: unknown,
  nodes: readonly Node[],
  nodeIdSet: ReadonlySet<number>,
): MapTourStep | null {
  if (!isRecord(raw)) return null;
  const id = normalizeStepId(raw.id);
  if (id === null) return null;
  const snapshot = normalizeSnapshot(raw.snapshot, nodes, nodeIdSet);
  if (snapshot === null) return null;
  const caption = normalizeTourCaption(raw.caption);
  return caption === undefined ? { id, snapshot } : { id, snapshot, caption };
}

export function normalizeTour(
  raw: unknown,
  nodeIdSet: ReadonlySet<number>,
  nodes: readonly Node[],
): MapTour | undefined {
  if (!isRecord(raw)) return undefined;
  if (raw.version !== MAP_TOUR_VERSION) return undefined;
  const title = normalizeTourTitle(raw.title);
  if (title === null) return undefined;
  if (!Array.isArray(raw.steps)) return undefined;

  const steps: MapTourStep[] = [];
  const seenIds = new Set<string>();
  for (const entry of raw.steps) {
    if (steps.length >= MAP_TOUR_STEP_MAX) break;
    const step = parseTourStep(entry, nodes, nodeIdSet);
    if (step === null) continue;
    if (seenIds.has(step.id)) continue;
    seenIds.add(step.id);
    steps.push(step);
  }
  if (steps.length === 0) return undefined;
  return { version: MAP_TOUR_VERSION, title, steps };
}

export function projectTour(
  tour: MapTour | undefined,
): { tour?: MapTour } {
  if (tour === undefined || tour.steps.length === 0) return {};
  return { tour };
}

function stepFieldsEqual(left: MapTourStep, right: MapTourStep): boolean {
  return (
    left.id === right.id
    && (left.caption ?? "") === (right.caption ?? "")
    && isSameMapView(left.snapshot, right.snapshot)
  );
}

export function areMapToursEqual(
  a: MapTour | undefined,
  b: MapTour | undefined,
): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (a.version !== b.version || a.title !== b.title || a.steps.length !== b.steps.length) return false;
  return a.steps.every((step, index) => stepFieldsEqual(step, b.steps[index]!));
}