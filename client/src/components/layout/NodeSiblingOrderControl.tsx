import type { KeyboardEvent } from "react";
import { TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE } from "@/components/map/treeEditShortcutGuard";
import { usePairedButtonFocusHandover } from "@/components/layout/usePairedButtonFocusHandover";

export type NodeSiblingOrderControlProps = {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
};

const buttonClassName = "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200";

export function NodeSiblingOrderControl({
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: NodeSiblingOrderControlProps) {
  const { firstRef, secondRef, handleFocus, handleBlur } = usePairedButtonFocusHandover(canMoveUp, canMoveDown);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    // Enterの押し続けで移動が連続し、フォーカス移動後に逆の操作が起きないよう、リピートのclick合成を止める
    if (event.key === "Enter" && event.repeat) event.preventDefault();
  }

  // 目印を付けたボタンでは、windowのAlt+↑/↓/←/→のショートカットが働く。ここでは処理しないので二重には動かない
  const shortcutTargetProps = { [TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE]: "" };

  // clickはevent.detailで弾かない。ダブルクリックは2回の移動として扱う。
  // pointerdownの既定動作は止めない。編集中のラベル入力をblurで確定してから移動させるため
  return (
    <div role="group" aria-label="兄弟の順序" className="flex shrink-0 gap-2">
      <button
        type="button"
        className={buttonClassName}
        ref={firstRef}
        aria-label="枝を上へ移動"
        aria-keyshortcuts="Alt+ArrowUp"
        title="枝を上へ移動（Alt/Option+↑）"
        onClick={onMoveUp}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        {...shortcutTargetProps}
        disabled={!canMoveUp}
      >
        上へ
      </button>
      <button
        type="button"
        className={buttonClassName}
        ref={secondRef}
        aria-label="枝を下へ移動"
        aria-keyshortcuts="Alt+ArrowDown"
        title="枝を下へ移動（Alt/Option+↓）"
        onClick={onMoveDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        {...shortcutTargetProps}
        disabled={!canMoveDown}
      >
        下へ
      </button>
    </div>
  );
}
