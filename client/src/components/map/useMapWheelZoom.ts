"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { toLocalPoint, type Point } from "@/components/map/mapGeometry";
import type { Viewport } from "@/components/map/mapViewport";
import type { LatestValue } from "@/components/map/pixi/pointerGesture";
import type { PixiRuntime } from "@/components/map/pixi/pixiTypes";

const WHEEL_ZOOM_SENSITIVITY = 0.001;

export function normalizeWheelDeltaY(deltaY: number, deltaMode: number, pageHeight: number): number {
  if (deltaMode === WheelEvent.DOM_DELTA_LINE) return deltaY * 16;
  if (deltaMode === WheelEvent.DOM_DELTA_PAGE) return deltaY * pageHeight;
  return deltaY;
}

type Options = {
  runtime: PixiRuntime | null;
  viewportRef: LatestValue<Viewport>;
  onBeforeZoom: () => void;
  onZoomAt: (anchor: Point, requestedScale: number) => void;
};

export function useMapWheelZoom({ runtime, viewportRef, onBeforeZoom, onZoomAt }: Options): void {
  const onBeforeZoomRef = useRef(onBeforeZoom);
  const onZoomAtRef = useRef(onZoomAt);
  useLayoutEffect(() => {
    onBeforeZoomRef.current = onBeforeZoom;
    onZoomAtRef.current = onZoomAt;
  }, [onBeforeZoom, onZoomAt]);

  useEffect(() => {
    if (!runtime) return;
    const canvas = runtime.app.canvas;
    const handleWheel = (event: WheelEvent) => {
      const delta = normalizeWheelDeltaY(
        event.deltaY,
        event.deltaMode,
        runtime.app.screen.height,
      );
      if (!Number.isFinite(delta)) return;
      event.preventDefault();
      onBeforeZoomRef.current();
      const anchor = toLocalPoint(
        event.clientX,
        event.clientY,
        canvas.getBoundingClientRect(),
      );
      onZoomAtRef.current(
        anchor,
        viewportRef.current.scale * Math.exp(-delta * WHEEL_ZOOM_SENSITIVITY),
      );
    };
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [runtime, viewportRef]);
}
