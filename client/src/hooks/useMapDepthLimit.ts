"use client";

import { useMemo, useState } from "react";
import { collectDepthVisibleNodeIds } from "@/domain/nodes/depthVisibility";
import type { Node } from "@/types/node";

export function useMapDepthLimit(nodes: readonly Node[]) {
  const [maxDepth, setMaxDepth] = useState<number | null>(null);
  const depthVisibleNodeIds = useMemo(
    () => collectDepthVisibleNodeIds(nodes, maxDepth),
    [maxDepth, nodes],
  );
  return { maxDepth, setMaxDepth, depthVisibleNodeIds };
}