"use client";

import { useMemo, useState } from "react";
import {
  collectHighlightNodeIds,
  type HighlightMode,
} from "@/domain/nodes/highlightSets";
import type { Node } from "@/types/node";

export function useMapHighlightMode(
  nodes: readonly Node[],
  displayVisibleNodeIds: ReadonlySet<number>,
  searchHitIds: ReadonlySet<number>,
  selectedNodeIds: readonly number[],
) {
  const [highlightMode, setHighlightMode] = useState<HighlightMode>("off");
  const selectedIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const highlightNodeIds = useMemo(
    () => collectHighlightNodeIds(
      highlightMode,
      searchHitIds,
      selectedIdSet,
      nodes,
      displayVisibleNodeIds,
    ),
    [displayVisibleNodeIds, highlightMode, nodes, searchHitIds, selectedIdSet],
  );
  return { highlightMode, setHighlightMode, highlightNodeIds };
}