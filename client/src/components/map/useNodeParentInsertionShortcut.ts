"use client";

import { useEffect } from "react";
import { resolveNodeParentInsertionShortcut } from "@/components/map/nodeParentInsertionShortcut";
import { createTreeEditShortcutInput } from "@/components/map/treeEditShortcutGuard";
import { useLatestRef } from "@/hooks/useLatestRef";

export type UseNodeParentInsertionShortcutOptions = {
  selectedNodeId: number | null;
  isEditing: boolean;
  hasActiveGesture: () => boolean;
  enabled: boolean;
  onInsertParentNode: (nodeId: number) => void;
};

export function useNodeParentInsertionShortcut({
  selectedNodeId,
  isEditing,
  hasActiveGesture,
  enabled,
  onInsertParentNode,
}: UseNodeParentInsertionShortcutOptions): void {
  // window の登録をやり直さないよう、最新の options を ref から読む
  const latestOptionsRef = useLatestRef({
    selectedNodeId,
    isEditing,
    hasActiveGesture,
    enabled,
    onInsertParentNode,
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const latest = latestOptionsRef.current;
      if (!latest.enabled) return;
      const input = {
        ...createTreeEditShortcutInput(event, {
          isEditing: latest.isEditing,
          selectedNodeId: latest.selectedNodeId,
          hasActiveGesture: latest.hasActiveGesture(),
        }),
        repeat: event.repeat,
      };
      const action = resolveNodeParentInsertionShortcut(input);
      switch (action) {
        case "insert":
          if (latest.selectedNodeId !== null) {
            event.preventDefault();
            latest.onInsertParentNode(latest.selectedNodeId);
          }
          return;
        case "suppress":
          // 押し続けでは挿入しない。目印のボタンの上でもボタンを押させない
          event.preventDefault();
          return;
        case null:
          return;
        default: {
          const unreachable: never = action;
          return unreachable;
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [latestOptionsRef]);
}
