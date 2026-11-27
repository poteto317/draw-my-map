"use client";

import { useId } from "react";
import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";
import { SHARE_COMMENT_MESSAGES } from "@/domain/share/shareCommentMessages";

type NodeCommentsSectionProps = {
  summary: { open: number; resolved: number };
  onOpen: () => void;
  /** 学習中・再生中は理由付きで無効にする（ヘッダーの「コメント」と同じ文言） */
  disabledReason: string | null;
};

const buttonClassName =
  "rounded border border-zinc-300 px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-100 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-700";

/** 右パネルの「コメント」節。選択ノードの件数と、選択ノードで絞ったコメントダイアログの入口（C4） */
export function NodeCommentsSection({ summary, onOpen, disabledReason }: NodeCommentsSectionProps) {
  const headingId = useId();
  const disabled = disabledReason !== null;
  const label = disabled
    ? `${SHARE_COMMENT_MESSAGES.openComments}（${disabledReason}）`
    : SHARE_COMMENT_MESSAGES.openComments;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
        {SHARE_COMMENT_MESSAGES.title}
      </h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        {`${SHARE_COMMENT_MESSAGES.title}: ${SHARE_COMMENT_MESSAGES.statusOpen} ${summary.open} / ${SHARE_COMMENT_MESSAGES.statusResolved} ${summary.resolved}`}
      </p>
      <button
        type="button"
        className={buttonClassName}
        aria-label={label}
        title={disabled ? disabledReason : undefined}
        disabled={disabled}
        onClick={onOpen}
        onKeyDown={preventRepeatedActivationClick}
      >
        {SHARE_COMMENT_MESSAGES.openComments}
      </button>
    </section>
  );
}
