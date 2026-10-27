import type { KeyboardEvent } from "react";
import { TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE } from "@/components/map/treeEditShortcutGuard";

export type NodeParentInsertControlProps = {
  canInsert: boolean;
  onInsert: () => void;
};

const buttonClassName = "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200";

export function NodeParentInsertControl({ canInsert, onInsert }: NodeParentInsertControlProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    // Enterの押し続けで挿入が連続しないよう、リピートのclick合成を止める。
    // 成功するとフォーカスは入力欄へ移るので、そこへ届くリピートは NodeLabelEditor が止める。2つの対策は組で働く
    if (event.key === "Enter" && event.repeat) event.preventDefault();
  }

  // 目印を付けたボタンでは、windowのAlt+Enterのショートカットが働く。ここでは処理しないので二重には動かない
  const shortcutTargetProps = { [TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE]: "" };

  // clickはevent.detailで弾かない。ダブルクリックは2回の操作として扱う。
  // pointerdownの既定動作は止めない。編集中のラベル入力をblurで確定してから挿入させるため。フォーカスは操作しない
  return (
    <button
      type="button"
      className={buttonClassName}
      aria-label="選択中のノードに親を挿入"
      aria-keyshortcuts="Alt+Enter"
      title="選択中のノードに親を挿入（Alt/Option+Enter）"
      onClick={onInsert}
      onKeyDown={handleKeyDown}
      {...shortcutTargetProps}
      disabled={!canInsert}
    >
      親を挿入
    </button>
  );
}
