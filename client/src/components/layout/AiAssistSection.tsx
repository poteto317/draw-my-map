"use client";

import { useId, type RefObject } from "react";
import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";
import type { AiAssistEntryAvailability } from "@/domain/aiAssist/aiAssistEntryAvailability";

export type AiAssistSectionProps = {
  summary: AiAssistEntryAvailability;
  importance: AiAssistEntryAvailability;
  // ダイアログを閉じたときのフォーカスの戻し先
  summaryButtonRef: RefObject<HTMLButtonElement | null>;
  importanceButtonRef: RefObject<HTMLButtonElement | null>;
  onOpenSummary: () => void;
  onOpenImportance: () => void;
};

const buttonClassName =
  "rounded border border-zinc-300 px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-700";

function EntryButton({
  label,
  entry,
  buttonRef,
  reasonId,
  onOpen,
}: {
  label: string;
  entry: AiAssistEntryAvailability;
  buttonRef: RefObject<HTMLButtonElement | null>;
  reasonId: string;
  onOpen: () => void;
}) {
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={!entry.enabled}
        aria-describedby={entry.enabled ? undefined : reasonId}
        onClick={onOpen}
        onKeyDown={preventRepeatedActivationClick}
        className={buttonClassName}
      >
        {label}
      </button>
      {!entry.enabled && <p id={reasonId} className="text-xs text-zinc-600 dark:text-zinc-300">{entry.reason}</p>}
    </>
  );
}

// 右パネル「ノードの詳細」の「AI支援」の節（Phase 32）。無効の理由はボタンの説明に結び付ける（L-057）
export function AiAssistSection({
  summary,
  importance,
  summaryButtonRef,
  importanceButtonRef,
  onOpenSummary,
  onOpenImportance,
}: AiAssistSectionProps) {
  const headingId = useId();
  const summaryReasonId = useId();
  const importanceReasonId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">AI支援</h2>
      <p className="text-xs text-zinc-600 dark:text-zinc-300">
        選んだ枝のラベルとメモを外部の AI に送り、提案を確かめてから適用します。
      </p>
      <EntryButton label="枝を要約してメモに入れる…" entry={summary} buttonRef={summaryButtonRef} reasonId={summaryReasonId} onOpen={onOpenSummary} />
      <EntryButton label="重要度を提案…" entry={importance} buttonRef={importanceButtonRef} reasonId={importanceReasonId} onOpen={onOpenImportance} />
    </section>
  );
}
