"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { isInteractiveTarget } from "@/components/map/interactiveTarget";
import { useLatestRef } from "@/hooks/useLatestRef";

type NodeKeyboardShortcutOptions = {
  selectedNodeId: number | null;
  isEditing: boolean;
  onAddChildNode: (parentId: number) => number | null;
  onAddSiblingNode: (nodeId: number) => number | null;
  onDeleteNode: (nodeId: number) => void;
  onStartEditing: (nodeId: number, initialText: string) => void;
  enabled: boolean;
  onClearSelection: () => void;
  isSiblingReorderActive: () => boolean;
  isContextMenuOpen: () => boolean;
};

export function useNodeKeyboardShortcuts({
  selectedNodeId,
  isEditing,
  onAddChildNode,
  onAddSiblingNode,
  onDeleteNode,
  onStartEditing,
  enabled,
  onClearSelection,
  isSiblingReorderActive,
  isContextMenuOpen,
}: NodeKeyboardShortcutOptions): void {
  // enabled の切り替えで window の登録をやり直さないよう、ref から読む
  const enabledRef = useRef(enabled);
  useLayoutEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  // Escape 用のガード／解除は描画ごとに差し替わっても登録し直さない
  const escapeOptionsRef = useLatestRef({
    onClearSelection,
    isSiblingReorderActive,
    isContextMenuOpen,
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!enabledRef.current) return;
      if (isEditing || isInteractiveTarget(event.target)) return;

      if (event.key === "Escape") {
        const escape = escapeOptionsRef.current;
        // 並べ替え Escape が同一 keydown で preventDefault 済みなら選択は触らない
        if (event.defaultPrevented) return;
        // メニュー閉じ後も選択を残す
        if (escape.isContextMenuOpen()) return;
        // 防御的。同一イベントでは defaultPrevented が主
        if (escape.isSiblingReorderActive()) return;
        escape.onClearSelection();
        return;
      }

      if (selectedNodeId === null) return;

      let createdId: number | null = null;
      if (event.key === "Tab") {
        event.preventDefault();
        createdId = onAddChildNode(selectedNodeId);
      } else if (event.key === "Enter" && !event.altKey) {
        // Alt を含む Enter は親の挿入のショートカットに任せる。兄弟を足さず、既定動作も止めない
        event.preventDefault();
        createdId = onAddSiblingNode(selectedNodeId);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        onDeleteNode(selectedNodeId);
      }

      if (createdId !== null) onStartEditing(createdId, "");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedNodeId,
    isEditing,
    onAddChildNode,
    onAddSiblingNode,
    onDeleteNode,
    onStartEditing,
    escapeOptionsRef,
  ]);
}
