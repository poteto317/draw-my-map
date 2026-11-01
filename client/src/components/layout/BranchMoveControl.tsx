import type { Ref } from "react";
import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";

type BranchMoveControlProps = {
  expanded: boolean;
  disabled: boolean;
  onOpen: () => void;
  buttonRef: Ref<HTMLButtonElement>;
};

const buttonClassName = "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200";

export function BranchMoveControl({ expanded, disabled, onOpen, buttonRef }: BranchMoveControlProps) {
  // 押し続けたEnter・Spaceのclick合成が、開いた直後のダイアログへ届かないようにする
  return (
    <button
      ref={buttonRef}
      type="button"
      className={buttonClassName}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      disabled={disabled}
      onClick={onOpen}
      onKeyDown={preventRepeatedActivationClick}
    >
      枝を移動
    </button>
  );
}
