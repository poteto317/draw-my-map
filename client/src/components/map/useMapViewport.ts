import { useCallback, useRef, useState } from "react";
import type { Point } from "@/components/map/mapGeometry";
import {
  INITIAL_VIEWPORT,
  isValidViewport,
  panViewport,
  zoomViewportAt,
  type ScreenSize,
  type Viewport,
} from "@/components/map/mapViewport";
import { focusViewportOnNode } from "@/components/map/nodeViewportFocus";
import type { Node } from "@/types/node";

export function useMapViewport() {
  const [viewport, setViewportState] = useState<Viewport>(INITIAL_VIEWPORT);
  const viewportRef = useRef<Viewport>(INITIAL_VIEWPORT);

  const setViewport = useCallback((next: Viewport) => {
    if (!isValidViewport(next)) return;
    viewportRef.current = next;
    setViewportState(next);
  }, []);

  // 同期 Ref の最新の viewport から次の値を求め、計算関数が同じ参照を返した（変化なし）ときは設定しない
  const updateViewport = useCallback((computeNext: (current: Viewport) => Viewport) => {
    const next = computeNext(viewportRef.current);
    if (next !== viewportRef.current) setViewport(next);
  }, [setViewport]);

  const panBy = useCallback((dx: number, dy: number) => {
    updateViewport((current) => panViewport(current, dx, dy));
  }, [updateViewport]);

  const zoomAt = useCallback((anchor: Point, requestedScale: number) => {
    updateViewport((current) => zoomViewportAt(current, anchor, requestedScale));
  }, [updateViewport]);

  const focusNode = useCallback((node: Node, screen: ScreenSize) => {
    updateViewport((current) => focusViewportOnNode(current, node, screen));
  }, [updateViewport]);

  return { viewport, viewportRef, setViewport, panBy, zoomAt, focusNode };
}
