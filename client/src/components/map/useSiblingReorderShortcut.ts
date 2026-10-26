"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { resolveSiblingReorderShortcut } from "@/components/map/siblingReorderShortcut";
import { createTreeEditShortcutInput } from "@/components/map/treeEditShortcutGuard";
import type { SiblingReorderRequest } from "@/domain/nodes/nodeSiblingOrder";

export type UseSiblingReorderShortcutOptions = {
  selectedNodeId: number | null;
  isEditing: boolean;
  hasActiveGesture: () => boolean;
  enabled: boolean;
  onReorderSibling: (nodeId: number, request: SiblingReorderRequest) => void;
};

export function useSiblingReorderShortcut({
  selectedNodeId,
  isEditing,
  hasActiveGesture,
  enabled,
  onReorderSibling,
}: UseSiblingReorderShortcutOptions): void {
  // window の登録をやり直さないよう、最新の options を ref から読む
  const latestOptionsRef = useRef({
    selectedNodeId,
    isEditing,
    hasActiveGesture,
    enabled,
    onReorderSibling,
  });
  useLayoutEffect(() => {
    latestOptionsRef.current = {
      selectedNodeId,
      isEditing,
      hasActiveGesture,
      enabled,
      onReorderSibling,
    };
  }, [selectedNodeId, isEditing, hasActiveGesture, enabled, onReorderSibling]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const latest = latestOptionsRef.current;
      if (!latest.enabled) return;
      const { selectedNodeId: nodeId } = latest;
      if (nodeId === null) return;
      const direction = resolveSiblingReorderShortcut(createTreeEditShortcutInput(event, {
        isEditing: latest.isEditing,
        selectedNodeId: nodeId,
        hasActiveGesture: latest.hasActiveGesture(),
      }));
      if (direction === null) return;
      // 端で動かせないときも既定動作は止める（結果は呼び出し先が通知する）
      event.preventDefault();
      latest.onReorderSibling(nodeId, { kind: "step", direction });
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
