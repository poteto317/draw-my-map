"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import {
  resolveNodeIndentShortcut,
  shouldSuppressAltArrowNavigation,
} from "@/components/map/nodeIndentShortcut";
import { createTreeEditShortcutInput } from "@/components/map/treeEditShortcutGuard";
import type { NodeIndentDirection } from "@/domain/nodes/nodeIndent";

export type UseNodeIndentShortcutOptions = {
  selectedNodeId: number | null;
  isEditing: boolean;
  hasActiveGesture: () => boolean;
  enabled: boolean;
  onChangeNodeIndent: (nodeId: number, direction: NodeIndentDirection) => void;
};

export function useNodeIndentShortcut({
  selectedNodeId,
  isEditing,
  hasActiveGesture,
  enabled,
  onChangeNodeIndent,
}: UseNodeIndentShortcutOptions): void {
  // window の登録をやり直さないよう、最新の options を ref から読む
  const latestOptionsRef = useRef({
    selectedNodeId,
    isEditing,
    hasActiveGesture,
    enabled,
    onChangeNodeIndent,
  });
  useLayoutEffect(() => {
    latestOptionsRef.current = {
      selectedNodeId,
      isEditing,
      hasActiveGesture,
      enabled,
      onChangeNodeIndent,
    };
  }, [selectedNodeId, isEditing, hasActiveGesture, enabled, onChangeNodeIndent]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const latest = latestOptionsRef.current;
      // ダイアログ中などは「戻る」「進む」も止めない（既知の制限）
      if (!latest.enabled) return;
      const input = createTreeEditShortcutInput(event, {
        isEditing: latest.isEditing,
        selectedNodeId: latest.selectedNodeId,
        hasActiveGesture: latest.hasActiveGesture(),
      });
      const direction = resolveNodeIndentShortcut(input);
      if (direction !== null && latest.selectedNodeId !== null) {
        // 端で動かせないときも既定動作は止める（結果は呼び出し先が通知する）
        event.preventDefault();
        latest.onChangeNodeIndent(latest.selectedNodeId, direction);
        return;
      }
      // 選択が無い・ジェスチャー中などでもブラウザの「戻る」「進む」だけは止める
      if (shouldSuppressAltArrowNavigation(input)) event.preventDefault();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
