import { IMPORTANCE_RANK } from "@/domain/nodes/nodeImportance";
import type { NodeImportance } from "@/types/nodeImportance";
import type { ResolutionLevel } from "@/types/nodeResolution";

const minimumVisibleRank: Record<ResolutionLevel, number> = {
  high: 2,
  medium: 1,
  all: 0,
};

const minimumVisibleLevel: Record<NodeImportance, ResolutionLevel> = {
  high: "high",
  medium: "medium",
  low: "all",
};

export function resolveMinimumVisibleLevel(
  importance: NodeImportance,
): ResolutionLevel {
  return minimumVisibleLevel[importance];
}

export function isNodeVisibleAtLevel(
  importance: NodeImportance,
  level: ResolutionLevel,
): boolean {
  return IMPORTANCE_RANK[importance] >= minimumVisibleRank[level];
}
