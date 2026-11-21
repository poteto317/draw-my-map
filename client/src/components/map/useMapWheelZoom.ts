"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { Point } from "@/components/map/mapGeometry";
import type { Viewport } from "@/components/map/mapViewport";
import { calculateWheelPanRequest } from "@/components/map/wheelPan";
import { calculateWheelZoomRequest } from "@/components/map/wheelZoom";
import type { LatestValue } from "@/components/map/pixi/pointerGesture";
import type { PixiRuntime } from "@/components/map/pixi/pixiTypes";

type Options = {
  runtime: PixiRuntime | null;
  viewportRef: LatestValue<Viewport>;
  wheelZoomSensitivity: number;
  onBeforeZoom: () => void;
  onPanBy: (dx: number, dy: number) => void;
  onZoomAt: (anchor: Point, requestedScale: number) => void;
};

export function useMapWheelZoom({
  runtime,
  viewportRef,
  wheelZoomSensitivity,
  onBeforeZoom,
  onPanBy,
  onZoomAt,
}: Options): void {
  const onBeforeZoomRef = useRef(onBeforeZoom);
  const onPanByRef = useRef(onPanBy);
  const onZoomAtRef = useRef(onZoomAt);
  const wheelZoomSensitivityRef = useRef(wheelZoomSensitivity);
  useLayoutEffect(() => {
    onBeforeZoomRef.current = onBeforeZoom;
    onPanByRef.current = onPanBy;
    onZoomAtRef.current = onZoomAt;
    wheelZoomSensitivityRef.current = wheelZoomSensitivity;
  }, [onBeforeZoom, onPanBy, onZoomAt, wheelZoomSensitivity]);

  useEffect(() => {
    if (!runtime) return;
    const canvas = runtime.app.canvas;
    const handleWheel = (event: WheelEvent) => {
      const pageHeight = runtime.app.screen.height;

      if (event.ctrlKey || event.metaKey) {
        const bounds = canvas.getBoundingClientRect();
        const request = calculateWheelZoomRequest({
          clientX: event.clientX,
          clientY: event.clientY,
          deltaY: event.deltaY,
          deltaMode: event.deltaMode,
          pageHeight,
          bounds,
        }, viewportRef.current.scale, wheelZoomSensitivityRef.current);
        event.preventDefault();
        if (!request) return;
        onBeforeZoomRef.current();
        onZoomAtRef.current(request.anchor, request.requestedScale);
        return;
      }

      const request = calculateWheelPanRequest({
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        pageHeight,
      });
      if (!request) return;
      event.preventDefault();
      onBeforeZoomRef.current();
      onPanByRef.current(request.dx, request.dy);
    };
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [runtime, viewportRef, wheelZoomSensitivity]);
}