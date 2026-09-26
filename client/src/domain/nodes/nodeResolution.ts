import type { NodeImportance } from "@/types/nodeImportance";
import type { ResolutionLevel } from "@/types/nodeResolution";

const importanceRank: Record<NodeImportance, number> = {
  high: 2,
  medium: 1,
  low: 0,
};

const minimumVisibleRank: Record<ResolutionLevel, number> = {
  high: 2,
  medium: 1,
  all: 0,
};

export function isNodeVisibleAtLevel(
  importance: NodeImportance,
  level: ResolutionLevel,
): boolean {
  return importanceRank[importance] >= minimumVisibleRank[level];
}
