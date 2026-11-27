"use client";

import type { Ref } from "react";
import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";
import { SHARE_COMMENT_MESSAGES } from "@/domain/share/shareCommentMessages";

type CommentsControlProps = {
  expanded: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onOpen: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
};

const buttonClassName =
  "rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200";

/** ヘッダーのコメント入口（ShareControl と同じ形。C3・L-060） */
export function CommentsControl({
  expanded,
  disabled = false,
  disabledReason,
  onOpen,
  buttonRef,
}: CommentsControlProps) {
  const label = disabled && disabledReason
    ? `${SHARE_COMMENT_MESSAGES.title}（${disabledReason}）`
    : SHARE_COMMENT_MESSAGES.title;

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
      {SHARE_COMMENT_MESSAGES.title}
    </button>
  );
}
