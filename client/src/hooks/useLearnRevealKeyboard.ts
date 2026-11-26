"use client";

import { useEffect } from "react";

type UseLearnRevealKeyboardOptions = {
  enabled: boolean;
  onReveal: () => void;
};

export function useLearnRevealKeyboard({ enabled, onReveal }: UseLearnRevealKeyboardOptions) {
  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.key !== "Enter") return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("[data-outline-root] textarea")) return;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (target instanceof HTMLElement && target.closest("button")) return;
      event.preventDefault();
      onReveal();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, onReveal]);
}