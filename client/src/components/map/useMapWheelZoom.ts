"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { Point } from "@/components/map/mapGeometry";
import type { Viewport } from "@/components/map/mapViewport";
import { calculateWheelZoomRequest } from "@/components/map/wheelZoom";
import type { LatestValue } from "@/components/map/pixi/pointerGesture";
import type { PixiRuntime } from "@/components/map/pixi/pixiTypes";

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
      const request = calculateWheelZoomRequest({
        clientX: event.clientX,
        clientY: event.clientY,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        pageHeight: runtime.app.screen.height,
        bounds: canvas.getBoundingClientRect(),
      }, viewportRef.current.scale);
      if (!request) return;
      event.preventDefault();
      onBeforeZoomRef.current();
      onZoomAtRef.current(request.anchor, request.requestedScale);
    };
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [runtime, viewportRef]);
}
