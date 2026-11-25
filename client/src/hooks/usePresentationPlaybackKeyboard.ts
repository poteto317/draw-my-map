"use client";

import { useEffect } from "react";

type UsePresentationPlaybackKeyboardOptions = {
  enabled: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onEnd: () => void;
};

export function usePresentationPlaybackKeyboard({
  enabled,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onEnd,
}: UsePresentationPlaybackKeyboardOptions): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onEnd();
        return;
      }
      if (event.key === "ArrowLeft" && canGoBack) {
        event.preventDefault();
        onBack();
        return;
      }
      if (event.key === "ArrowRight" && canGoForward) {
        event.preventDefault();
        onForward();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canGoBack, canGoForward, enabled, onBack, onEnd, onForward]);
}