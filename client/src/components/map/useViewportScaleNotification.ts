"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

export function useViewportScaleNotification(
  scale: number,
  callback: ((scale: number) => void) | undefined,
): void {
  const callbackRef = useRef(callback);
  const lastNotifiedScaleRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (lastNotifiedScaleRef.current === scale) return;
    lastNotifiedScaleRef.current = scale;
    callbackRef.current?.(scale);
  }, [scale]);
}
