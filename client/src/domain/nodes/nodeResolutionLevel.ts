import type {
  ResolutionFilterMode,
  ResolutionLevel,
} from "@/types/nodeResolution";

export const HIGH_TO_MEDIUM_SCALE = 0.65;
export const MEDIUM_TO_HIGH_SCALE = 0.55;
export const MEDIUM_TO_ALL_SCALE = 1.05;
export const ALL_TO_MEDIUM_SCALE = 0.95;

const INITIAL_HIGH_TO_MEDIUM_SCALE = 0.6;
const INITIAL_MEDIUM_TO_ALL_SCALE = 1;

export function resolveAutomaticResolutionLevel(
  scale: number,
  previousLevel: ResolutionLevel | null,
): ResolutionLevel {
  if (previousLevel === null) {
    if (scale < INITIAL_HIGH_TO_MEDIUM_SCALE) {
      return "high";
    }

    return scale < INITIAL_MEDIUM_TO_ALL_SCALE ? "medium" : "all";
  }

  if (previousLevel === "high") {
    if (scale >= MEDIUM_TO_ALL_SCALE) {
      return "all";
    }

    return scale >= HIGH_TO_MEDIUM_SCALE ? "medium" : "high";
  }

  if (previousLevel === "medium") {
    if (scale < MEDIUM_TO_HIGH_SCALE) {
      return "high";
    }

    return scale >= MEDIUM_TO_ALL_SCALE ? "all" : "medium";
  }

  if (scale < MEDIUM_TO_HIGH_SCALE) {
    return "high";
  }

  return scale < ALL_TO_MEDIUM_SCALE ? "medium" : "all";
}

export function resolveResolutionLevel(
  mode: ResolutionFilterMode,
  scale: number,
  previousLevel: ResolutionLevel | null,
): ResolutionLevel {
  return mode === "auto"
    ? resolveAutomaticResolutionLevel(scale, previousLevel)
    : mode;
}
