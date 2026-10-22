"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { isInsideNodeContextMenu } from "@/components/map/nodeContextMenuDom";

export function useNodeContextMenuDismissal(
  isOpen: boolean,
  onDismiss: () => void,
  enabled: boolean,
): void {
  // enabled が false の間（ダイアログ表示中など）は閉じる操作に反応しない。切り替えてもリスナーは登録し直さない
  const enabledRef = useRef(enabled);
  useLayoutEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!enabledRef.current) return;
      if (event.key === "Escape" || event.key === "Tab") onDismiss();
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!enabledRef.current) return;
      if (!isInsideNodeContextMenu(event.target)) onDismiss();
    };
    const handleFocusOut = (event: FocusEvent) => {
      if (!enabledRef.current) return;
      if (event.relatedTarget !== null && !isInsideNodeContextMenu(event.relatedTarget)) onDismiss();
    };
    const handleDismiss = () => {
      if (enabledRef.current) onDismiss();
    };

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
