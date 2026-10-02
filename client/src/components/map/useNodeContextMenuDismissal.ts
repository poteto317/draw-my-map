"use client";

import { useEffect } from "react";
import { isInsideNodeContextMenu } from "@/components/map/nodeContextMenuDom";

export function useNodeContextMenuDismissal(isOpen: boolean, onDismiss: () => void): void {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Tab") onDismiss();
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!isInsideNodeContextMenu(event.target)) onDismiss();
    };
    const handleFocusOut = (event: FocusEvent) => {
      if (event.relatedTarget !== null && !isInsideNodeContextMenu(event.relatedTarget)) onDismiss();
    };
    const handleDismiss = () => onDismiss();

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("wheel", handleDismiss, true);
    window.addEventListener("blur", handleDismiss);
    window.addEventListener("focusout", handleFocusOut, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("wheel", handleDismiss, true);
      window.removeEventListener("blur", handleDismiss);
      window.removeEventListener("focusout", handleFocusOut, true);
    };
  }, [isOpen, onDismiss]);
}
