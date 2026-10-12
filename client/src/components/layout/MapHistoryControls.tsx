import { useLayoutEffect, useRef, type FocusEvent, type KeyboardEvent } from "react";

type MapHistoryControlsProps = {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
};

const buttonClassName = "rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200";

export function MapHistoryControls({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: MapHistoryControlsProps) {
  const undoButtonRef = useRef<HTMLButtonElement>(null);
  const redoButtonRef = useRef<HTMLButtonElement>(null);
  // 直前にフォーカスしていたボタン。無効化でbodyへフォーカスが戻るブラウザでも、どちらを押していたか分かるよう残す
  const focusedButtonRef = useRef<HTMLButtonElement | null>(null);

  useLayoutEffect(() => {
    const focusedButton = focusedButtonRef.current;
    if (!focusedButton?.disabled) return;
    const activeElement = document.activeElement;
    if (activeElement !== focusedButton && activeElement !== document.body && activeElement !== null) return;
    const otherButton = focusedButton === undoButtonRef.current ? redoButtonRef.current : undoButtonRef.current;
    if (!otherButton || otherButton.disabled) return;
    // 押したボタンが無効になってもキーボードのフォーカスを失わないよう、もう一方の有効なボタンへ移す
    otherButton.focus();
  }, [canUndo, canRedo]);

  function handleFocus(event: FocusEvent<HTMLButtonElement>) {
    focusedButtonRef.current = event.currentTarget;
  }

  function handleBlur(event: FocusEvent<HTMLButtonElement>) {
    // 無効化によるblurでは記録を残し、ほかの要素へ移ったときだけ消す
    if (!event.currentTarget.disabled) focusedButtonRef.current = null;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    // Enterの押し続けで履歴が連続して進み、フォーカス移動後にUndoとRedoが往復しないよう、リピートのclick合成を止める
    if (event.key === "Enter" && event.repeat) event.preventDefault();
  }

  // pointerdownの既定動作は止めない。編集中のラベル入力をblurで確定してから履歴を操作させるため
  return (
    <div className="flex shrink-0 gap-2">
      <button
        type="button"
        className={buttonClassName}
        ref={undoButtonRef}
        onClick={onUndo}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={!canUndo}
      >
        元に戻す
      </button>
      <button
        type="button"
        className={buttonClassName}
        ref={redoButtonRef}
        onClick={onRedo}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={!canRedo}
      >
        やり直す
      </button>
    </div>
  );
}
