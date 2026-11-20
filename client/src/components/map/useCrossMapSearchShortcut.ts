"use client";

import { useEffect } from "react";
import { isEditableTarget } from "@/components/map/editableTarget";
import {
  hasSingleCommandModifier,
  isProcessableKeyEvent,
} from "@/components/map/mapHistoryShortcut";
import { useLatestRef } from "@/hooks/useLatestRef";

type CrossMapSearchShortcutOptions = {
  enabled: boolean;
  onOpen: () => void;
};

// 全マップ横断検索ショートカット（Cmd/Ctrl+Shift+F）の判定。
// 履歴ショートカットと同じく修飾キーは Ctrl / Cmd の片方のみを受け付け、入力先・IME・repeat は除外する
export function isCrossMapSearchShortcut(event: KeyboardEvent): boolean {
  return (
    isProcessableKeyEvent(event)
    && hasSingleCommandModifier(event)
    && event.shiftKey
    && event.key.toLowerCase() === "f"
    && !isEditableTarget(event.target)
  );
}

export function useCrossMapSearchShortcut({
  enabled,
  onOpen,
}: CrossMapSearchShortcutOptions): void {
  const latestOptionsRef = useLatestRef<CrossMapSearchShortcutOptions>({
    enabled,
    onOpen,
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const { enabled: isEnabled, onOpen: open } = latestOptionsRef.current;
      if (!isEnabled) return;
      if (!isCrossMapSearchShortcut(event)) return;
      event.preventDefault();
      open();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [latestOptionsRef]);
}
