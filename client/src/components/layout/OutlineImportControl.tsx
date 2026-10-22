import type { KeyboardEvent, Ref } from "react";

type OutlineImportControlProps = {
  expanded: boolean;
  onOpen: () => void;
  buttonRef: Ref<HTMLButtonElement>;
};

const buttonClassName = "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200";

function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
  // 押し続けたEnter・Spaceのclick合成が、開いた直後のダイアログへ届かないようにする
  if ((event.key === "Enter" || event.key === " ") && event.repeat) {
    event.preventDefault();
  }
}

export function OutlineImportControl({ expanded, onOpen, buttonRef }: OutlineImportControlProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={buttonClassName}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
    >
      箇条書きから追加
    </button>
  );
}
