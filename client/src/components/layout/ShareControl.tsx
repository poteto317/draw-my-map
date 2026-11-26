"use client";

import type { Ref } from "react";
import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";

type ShareControlProps = {
  expanded: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onOpen: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
};

const buttonClassName =
  "rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200";

/** ヘッダーの共有入口（L-060） */
export function ShareControl({
  expanded,
  disabled = false,
  disabledReason,
  onOpen,
  buttonRef,
}: ShareControlProps) {
  const label = disabled && disabledReason
    ? `共有（${disabledReason}）`
    : "共有";

  return (
    <button
      ref={buttonRef}
      type="button"
      className={buttonClassName}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-label={label}
      title={disabled ? disabledReason : undefined}
      disabled={disabled}
      onClick={onOpen}
      onKeyDown={preventRepeatedActivationClick}
    >
      共有
    </button>
  );
}
