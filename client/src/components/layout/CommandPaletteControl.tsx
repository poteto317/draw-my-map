import type { RefObject } from "react";
import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";

export type CommandPaletteControlProps = {
  expanded: boolean;
  onOpen: () => void;
  buttonRef: RefObject<HTMLButtonElement | null>;
};

const buttonClassName =
  "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-zinc-700 dark:text-zinc-200";

export function CommandPaletteControl({
  expanded,
  onOpen,
  buttonRef,
}: CommandPaletteControlProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={buttonClassName}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-keyshortcuts="Control+K Meta+K"
      onClick={onOpen}
      onKeyDown={preventRepeatedActivationClick}
    >
      コマンド
    </button>
  );
}
