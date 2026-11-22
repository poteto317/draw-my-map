"use client";

import { useMemo, useState } from "react";
import {
  getViewportWorldRect,
  isValidScreenSize,
  type ScreenSize,
  type Viewport,
} from "@/components/map/mapViewport";
import { isViewportCullingEnabled } from "@/components/map/viewportCullingPolicy";
import {
  cullNodesInViewport,
  mergeCulledNodesWithRequired,
  VIEWPORT_CULL_PADDING_PX,
} from "@/domain/nodes/cullNodesInViewport";
import type { Node } from "@/types/node";

function sameCulledNodes(previous: readonly Node[], next: readonly Node[]): boolean {
  if (previous.length !== next.length) return false;
  for (let index = 0; index < previous.length; index += 1) {
    if (previous[index] !== next[index]) return false;
  }
  return true;
}

export function useViewportCulledRenderNodes(
  nodes: readonly Node[],
  viewport: Viewport,
  screenSize: ScreenSize | null,
  requiredNodeIds: ReadonlySet<number>,
): readonly Node[] {
  const culledNodes = useMemo(() => {
    if (!isViewportCullingEnabled() || screenSize === null || !isValidScreenSize(screenSize)) {
      return nodes;
    }
    const worldRect = getViewportWorldRect(viewport, screenSize);
    const padding = VIEWPORT_CULL_PADDING_PX / viewport.scale;
    const culled = cullNodesInViewport(nodes, worldRect, padding);
    return mergeCulledNodesWithRequired(nodes, culled, requiredNodeIds);
  }, [nodes, requiredNodeIds, viewport, screenSize]);

  const [renderNodes, setRenderNodes] = useState(culledNodes);
  if (renderNodes !== culledNodes && !sameCulledNodes(renderNodes, culledNodes)) {
    setRenderNodes(culledNodes);
  }
  return renderNodes;
}