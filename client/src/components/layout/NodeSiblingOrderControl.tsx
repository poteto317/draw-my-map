import { useLayoutEffect, useRef, type FocusEvent, type KeyboardEvent } from "react";

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
  const upButtonRef = useRef<HTMLButtonElement>(null);
  const downButtonRef = useRef<HTMLButtonElement>(null);
  // 直前にフォーカスしていたボタン。無効化でbodyへフォーカスが戻るブラウザでも、どちらを押していたか分かるよう残す
  const focusedButtonRef = useRef<HTMLButtonElement | null>(null);

  useLayoutEffect(() => {
    const focusedButton = focusedButtonRef.current;
    if (!focusedButton?.disabled) return;
    const activeElement = document.activeElement;
    if (activeElement !== focusedButton && activeElement !== document.body && activeElement !== null) return;
    const otherButton = focusedButton === upButtonRef.current ? downButtonRef.current : upButtonRef.current;
    if (!otherButton || otherButton.disabled) {
      // 移せる先が無いなら記録を捨てる。残すと、後で別の理由でボタンが有効になったときに誤ってフォーカスを奪う
      focusedButtonRef.current = null;
      return;
    }
    // 端に着いて押したボタンが無効になってもキーボードのフォーカスを失わないよう、もう一方の有効なボタンへ移す
    otherButton.focus();
  }, [canMoveUp, canMoveDown]);

  function handleFocus(event: FocusEvent<HTMLButtonElement>) {
    focusedButtonRef.current = event.currentTarget;
  }

  function handleBlur(event: FocusEvent<HTMLButtonElement>) {
    // 無効化によるblurでは記録を残し、ほかの要素へ移ったときだけ消す
    if (!event.currentTarget.disabled) focusedButtonRef.current = null;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    // Enterの押し続けで移動が連続し、フォーカス移動後に逆の操作が起きないよう、リピートのclick合成を止める
    if (event.key === "Enter" && event.repeat) event.preventDefault();
  }

  // clickはevent.detailで弾かない。ダブルクリックは2回の移動として扱う。
  // pointerdownの既定動作は止めない。編集中のラベル入力をblurで確定してから移動させるため
  return (
    <div role="group" aria-label="兄弟の順序" className="flex shrink-0 gap-2">
      <button
        type="button"
        className={buttonClassName}
        ref={upButtonRef}
        aria-label="枝を上へ移動"
        aria-keyshortcuts="Alt+ArrowUp"
        title="枝を上へ移動（Alt/Option+↑）"
        onClick={onMoveUp}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={!canMoveUp}
      >
        上へ
      </button>
      <button
        type="button"
        className={buttonClassName}
        ref={downButtonRef}
        aria-label="枝を下へ移動"
        aria-keyshortcuts="Alt+ArrowDown"
        title="枝を下へ移動（Alt/Option+↓）"
        onClick={onMoveDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={!canMoveDown}
      >
        下へ
      </button>
    </div>
  );
}
