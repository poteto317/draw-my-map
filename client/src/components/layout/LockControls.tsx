"use client";

import { useEffect, useId, useState } from "react";

type LockControlsProps = {
  selectionActive: boolean;
  nodeLocked: boolean;
  disabled?: boolean;
  onToggleLock: () => void;
  onLockSubtree: () => void;
  onUnlockSubtree: () => void;
};

const NO_SELECTION_TOOLTIP = "ノードを1件だけ選択してください。";

const buttonClassName =
  "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600";

const menuItemClassName =
  "rounded px-2 py-1 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700";

export function LockControls({
  selectionActive,
  nodeLocked,
  disabled = false,
  onToggleLock,
  onLockSubtree,
  onUnlockSubtree,
}: LockControlsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();

  // L-214: 選択消失で開状態を閉じる（Phase 24 オーバーレイ同期と同型）
  /* eslint-disable react-hooks/set-state-in-effect -- selectionActive の外部同期 */
  useEffect(() => {
    if (!selectionActive) setMenuOpen(false);
  }, [selectionActive]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const toggleLabel = nodeLocked ? "ロックを解除" : "ロックする";

  return (
    <div
      className="relative flex shrink-0 items-center"
      title={!selectionActive ? NO_SELECTION_TOOLTIP : undefined}
    >
      <button
        type="button"
        className={buttonClassName}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        disabled={!selectionActive || disabled}
        onClick={() => setMenuOpen((open) => !open)}
      >
        編集ロック
      </button>
      {menuOpen && (
        <div
          id={menuId}
          role="menu"
          aria-label="編集ロック"
          className="absolute top-full left-0 z-20 mt-1 flex min-w-[12rem] flex-col gap-1 rounded-md border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-600 dark:bg-zinc-800"
        >
          <button
            type="button"
            role="menuitem"
            className={menuItemClassName}
            onClick={() => {
              onToggleLock();
              setMenuOpen(false);
            }}
          >
            {toggleLabel}
          </button>
          <button
            type="button"
            role="menuitem"
            className={menuItemClassName}
            onClick={() => {
              onLockSubtree();
              setMenuOpen(false);
            }}
          >
            枝をロック
          </button>
          <button
            type="button"
            role="menuitem"
            className={menuItemClassName}
            onClick={() => {
              onUnlockSubtree();
              setMenuOpen(false);
            }}
          >
            枝のロックを解除
          </button>
        </div>
      )}
    </div>
  );
}