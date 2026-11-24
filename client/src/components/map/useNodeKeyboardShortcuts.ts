"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { isInteractiveTarget } from "@/components/map/interactiveTarget";
import { useLatestRef } from "@/hooks/useLatestRef";

type NodeKeyboardShortcutOptions = {
  selectedNodeId: number | null;
  selectedRelationId?: number | null;
  selectedGroupId?: number | null;
  isEditing: boolean;
  onAddChildNode: (parentId: number) => number | null;
  onAddSiblingNode: (nodeId: number) => number | null;
  onDeleteNode: (nodeId: number) => void;
  onDeleteRelation?: (relationId: number) => void;
  onDeleteGroup?: (groupId: number) => void;
  onStartEditing: (nodeId: number, initialText: string) => void;
  enabled: boolean;
  onClearSelection: () => void;
  isSiblingReorderActive: () => boolean;
  isContextMenuOpen: () => boolean;
};

export function useNodeKeyboardShortcuts({
  selectedNodeId,
  selectedRelationId = null,
  selectedGroupId = null,
  isEditing,
  onAddChildNode,
  onAddSiblingNode,
  onDeleteNode,
  onDeleteRelation,
  onDeleteGroup,
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

  // 関連線／グループ削除は MapStage 側 callback が nodes 依存で毎回新しくなりうる。
  // keydown 登録をノード内容変更で張り直さないよう ref から読む（L-061 Delete 振替）
  const relationGroupDeleteRef = useLatestRef({
    selectedRelationId,
    selectedGroupId,
    onDeleteRelation,
    onDeleteGroup,
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

      if (event.key === "Delete" || event.key === "Backspace") {
        const relationGroup = relationGroupDeleteRef.current;
        if (
          relationGroup.selectedRelationId !== null
          && relationGroup.onDeleteRelation !== undefined
        ) {
          event.preventDefault();
          relationGroup.onDeleteRelation(relationGroup.selectedRelationId);
          return;
        }
        if (
          relationGroup.selectedGroupId !== null
          && relationGroup.onDeleteGroup !== undefined
        ) {
          event.preventDefault();
          relationGroup.onDeleteGroup(relationGroup.selectedGroupId);
          return;
        }
        if (selectedNodeId !== null) {
          event.preventDefault();
          onDeleteNode(selectedNodeId);
        }
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
    relationGroupDeleteRef,
  ]);
}
