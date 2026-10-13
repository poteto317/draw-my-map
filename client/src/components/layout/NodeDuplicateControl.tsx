import type { KeyboardEvent } from "react";

type NodeDuplicateControlProps = {
  disabled: boolean;
  onDuplicate: () => void;
};

const buttonClassName = "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200";

export function NodeDuplicateControl({ disabled, onDuplicate }: NodeDuplicateControlProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    // Enterの押し続けで枝が連続して増えないよう、リピートのclick合成を止める
    if (event.key === "Enter" && event.repeat) event.preventDefault();
  }

  // clickはevent.detailで弾かない。ダブルクリックは2回の複製として扱う。
  // pointerdownの既定動作は止めない。編集中のラベル入力をblurで確定してから複製させるため
  return (
    <button
      type="button"
      className={buttonClassName}
      onClick={onDuplicate}
      onKeyDown={handleKeyDown}
      disabled={disabled}
    >
      枝を複製
    </button>
  );
}
