import { useCallback, useRef, useState } from "react";
import type { Point } from "@/components/map/mapGeometry";
import {
  INITIAL_VIEWPORT,
  focusViewportOnNode,
  isValidViewport,
  panViewport,
  zoomViewportAt,
  type ScreenSize,
  type Viewport,
} from "@/components/map/mapViewport";
import type { Node } from "@/types/node";

export function useMapViewport() {
  const [viewport, setViewportState] = useState<Viewport>(INITIAL_VIEWPORT);
  const viewportRef = useRef<Viewport>(INITIAL_VIEWPORT);

  const setViewport = useCallback((next: Viewport) => {
    if (!isValidViewport(next)) return;
    viewportRef.current = next;
    setViewportState(next);
  }, []);

  const panBy = useCallback((dx: number, dy: number) => {
    const next = panViewport(viewportRef.current, dx, dy);
    if (next !== viewportRef.current) setViewport(next);
  }, [setViewport]);

  const zoomAt = useCallback((anchor: Point, requestedScale: number) => {
    const next = zoomViewportAt(viewportRef.current, anchor, requestedScale);
    if (next !== viewportRef.current) setViewport(next);
  }, [setViewport]);

  const focusNode = useCallback((node: Node, screen: ScreenSize) => {
    const next = focusViewportOnNode(viewportRef.current, node, screen);
    if (next !== viewportRef.current) setViewport(next);
  }, [setViewport]);

  return { viewport, viewportRef, setViewport, panBy, zoomAt, focusNode };
}
