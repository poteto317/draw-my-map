import type { Ref } from "react";
import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";

type PresentationStartControlProps = {
  disabled: boolean;
  onStart: () => void;
  buttonRef: Ref<HTMLButtonElement>;
};

const buttonClassName = "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200";

export function PresentationStartControl({
  disabled,
  onStart,
  buttonRef,
}: PresentationStartControlProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={buttonClassName}
      disabled={disabled}
      onClick={onStart}
      onKeyDown={preventRepeatedActivationClick}
    >
      プレゼン開始
    </button>
  );
}