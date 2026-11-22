import { isPlainRecord } from "@/domain/shared/unknownRecord";

export type LayoutSnapPrefs = {
  readonly enabled: boolean;
  readonly showGrid: boolean;
  readonly gridStep: number;
};

export const DEFAULT_GRID_STEP = 8;
export const MIN_GRID_STEP = 4;
export const MAX_GRID_STEP = 64;

export const DEFAULT_LAYOUT_SNAP_PREFS: LayoutSnapPrefs = {
  enabled: true,
  showGrid: false,
  gridStep: DEFAULT_GRID_STEP,
};

export function isValidGridStep(value: unknown): value is number {
  return typeof value === "number"
    && Number.isFinite(value)
    && Number.isInteger(value)
    && value >= MIN_GRID_STEP
    && value <= MAX_GRID_STEP
    && value % 4 === 0;
}

export function clampGridStep(raw: number): number {
  if (!Number.isFinite(raw)) return DEFAULT_GRID_STEP;
  const rounded = Math.round(raw);
  const clamped = Math.min(MAX_GRID_STEP, Math.max(MIN_GRID_STEP, rounded));
  const aligned = Math.round(clamped / 4) * 4;
  return Math.min(MAX_GRID_STEP, Math.max(MIN_GRID_STEP, aligned));
}

export function snapToGrid(value: number, step: number): number {
  if (!Number.isFinite(value) || !isValidGridStep(step)) return value;
  return Math.round(value / step) * step;
}

export function isValidLayoutSnapPrefs(value: unknown): value is LayoutSnapPrefs {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.enabled === "boolean"
    && typeof record.showGrid === "boolean"
    && isValidGridStep(record.gridStep);
}

export function mergeLayoutSnapPrefs(
  base: LayoutSnapPrefs,
  partial: Partial<LayoutSnapPrefs>,
): LayoutSnapPrefs {
  return {
    enabled: partial.enabled ?? base.enabled,
    showGrid: partial.showGrid ?? base.showGrid,
    gridStep: partial.gridStep !== undefined
      ? clampGridStep(partial.gridStep)
      : base.gridStep,
  };
}

export function decodeLayoutSnapPrefsFromUnknown(parsed: unknown): LayoutSnapPrefs | null {
  if (!isPlainRecord(parsed)) return null;
  if (parsed.version !== 1) return null;
  if (typeof parsed.enabled !== "boolean") return null;
  if (typeof parsed.showGrid !== "boolean") return null;
  if (!isValidGridStep(parsed.gridStep)) return null;
  return {
    enabled: parsed.enabled,
    showGrid: parsed.showGrid,
    gridStep: parsed.gridStep,
  };
}