import { TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE } from "@/components/map/treeEditShortcutGuard";
import { preventRepeatedEnterClick } from "@/components/layout/repeatedEnterClick";
import { usePairedButtonFocusHandover } from "@/components/layout/usePairedButtonFocusHandover";

export type NodeIndentControlProps = {
  canOutdent: boolean;
  canIndent: boolean;
  onOutdent: () => void;
  onIndent: () => void;
};

const buttonClassName = "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200";

export function NodeIndentControl({
  canOutdent,
  canIndent,
  onOutdent,
  onIndent,
}: NodeIndentControlProps) {
  const { firstRef, secondRef, handleFocus, handleBlur } = usePairedButtonFocusHandover(canOutdent, canIndent);

  // Enterの押し続けで操作が連続し、フォーカス移動後に逆の操作が起きないよう、リピートのclick合成を止める（preventRepeatedEnterClick）
  // 目印を付けたボタンでは、windowのAlt+←/→のショートカットが働く。ここでは処理しないので二重には動かない
  const shortcutTargetProps = { [TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE]: "" };

  // clickはevent.detailで弾かない。ダブルクリックは2回の操作として扱う。
  // pointerdownの既定動作は止めない。編集中のラベル入力をblurで確定してから操作させるため
  return (
    <div role="group" aria-label="階層" className="flex shrink-0 gap-2">
      <button
        type="button"
        className={buttonClassName}
        ref={firstRef}
        aria-label="枝の階層を上げる"
        aria-keyshortcuts="Alt+ArrowLeft"
        title="枝の階層を上げる（Alt/Option+←）"
        onClick={onOutdent}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={preventRepeatedEnterClick}
        {...shortcutTargetProps}
        disabled={!canOutdent}
      >
        階層を上げる
      </button>
      <button
        type="button"
        className={buttonClassName}
        ref={secondRef}
        aria-label="枝の階層を下げる"
        aria-keyshortcuts="Alt+ArrowRight"
        title="枝の階層を下げる（Alt/Option+→）"
        onClick={onIndent}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={preventRepeatedEnterClick}
        {...shortcutTargetProps}
        disabled={!canIndent}
      >
        階層を下げる
      </button>
    </div>
  );
}
