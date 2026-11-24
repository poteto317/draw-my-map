import type { ForestItem } from "@/domain/nodes/nodeForestInsertion";
import {
  buildForestItemsPreview,
  OUTLINE_PREVIEW_MAX_ITEMS,
  type OutlinePreview,
} from "@/domain/outline/outlinePreview";

export function forestDepthStats(items: readonly ForestItem[]): {
  rootCount: number;
  maxDepth: number;
} {
  let rootCount = 0;
  let maxDepth = 0;
  for (let index = 0; index < items.length; index += 1) {
    if (items[index]!.parentIndex === null) rootCount += 1;
    let depth = 0;
    let parent = items[index]!.parentIndex;
    while (parent !== null && parent < index) {
      depth += 1;
      parent = items[parent]!.parentIndex;
    }
    if (depth > maxDepth) maxDepth = depth;
  }
  return { rootCount, maxDepth };
}

export function buildExchangePreview(
  items: readonly ForestItem[],
  maxItems = OUTLINE_PREVIEW_MAX_ITEMS,
): OutlinePreview {
  return buildForestItemsPreview(items, maxItems);
}