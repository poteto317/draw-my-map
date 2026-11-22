"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { isValidScreenSize, type ScreenSize, type Viewport } from "@/types/viewport";

export type ViewportFrame = {
  viewport: Viewport;
  screen: ScreenSize;
};

export function useViewportFrameNotification(
  viewport: Viewport,
  screen: ScreenSize | null,
  callback: ((frame: ViewportFrame) => void) | undefined,
): void {
  const callbackRef = useRef(callback);
  const lastKeyRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (screen === null || !isValidScreenSize(screen)) return;
    const key = `${viewport.offsetX}:${viewport.offsetY}:${viewport.scale}:${screen.width}:${screen.height}`;
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    callbackRef.current?.({ viewport, screen });
  }, [screen, viewport]);
}
