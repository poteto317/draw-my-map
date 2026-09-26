import type { NodeImportance, ResolutionLevel } from "@/types/nodeImportance";

export const DEFAULT_NODE_IMPORTANCE: NodeImportance = "medium";

const rank: Record<NodeImportance, number> = { high: 2, medium: 1, low: 0 };
const minimumRank: Record<ResolutionLevel, number> = { high: 2, medium: 1, all: 0 };

export function isNodeVisibleAtLevel(
  importance: NodeImportance,
  level: ResolutionLevel,
): boolean {
  return rank[importance] >= minimumRank[level];
}
