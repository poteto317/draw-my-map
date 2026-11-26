"use client";

import { useEffect } from "react";

type UseLearnReviewCardsKeyboardOptions = {
  enabled: boolean;
  onFlip: () => void;
  onPrevious: () => void;
  onNext: () => void;
};

export function useLearnReviewCardsKeyboard({
  enabled,
  onFlip,
  onPrevious,
  onNext,
}: UseLearnReviewCardsKeyboardOptions) {
  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (target instanceof HTMLElement && target.closest("button")) return;
      if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        onFlip();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onPrevious();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, onFlip, onNext, onPrevious]);
}