"use client";

import { useId, type RefObject } from "react";
import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";
import type { AiAssistEntryAvailability } from "@/domain/aiAssist/aiAssistEntryAvailability";

export type AiAssistSectionProps = {
  summary: AiAssistEntryAvailability;
  importance: AiAssistEntryAvailability;
  childCandidates: AiAssistEntryAvailability;
  classifyReorder: AiAssistEntryAvailability;
  duplicates: AiAssistEntryAvailability;
  missingPerspectives: AiAssistEntryAvailability;
  summaryButtonRef: RefObject<HTMLButtonElement | null>;
  importanceButtonRef: RefObject<HTMLButtonElement | null>;
  childCandidatesButtonRef: RefObject<HTMLButtonElement | null>;
  classifyReorderButtonRef: RefObject<HTMLButtonElement | null>;
  duplicatesButtonRef: RefObject<HTMLButtonElement | null>;
  missingPerspectivesButtonRef: RefObject<HTMLButtonElement | null>;
  onOpenSummary: () => void;
  onOpenImportance: () => void;
  onOpenChildCandidates: () => void;
  onOpenClassifyReorder: () => void;
  onOpenDuplicates: () => void;
  onOpenMissingPerspectives: () => void;
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

export function AiAssistSection({
  summary,
  importance,
  childCandidates,
  classifyReorder,
  duplicates,
  missingPerspectives,
  summaryButtonRef,
  importanceButtonRef,
  childCandidatesButtonRef,
  classifyReorderButtonRef,
  duplicatesButtonRef,
  missingPerspectivesButtonRef,
  onOpenSummary,
  onOpenImportance,
  onOpenChildCandidates,
  onOpenClassifyReorder,
  onOpenDuplicates,
  onOpenMissingPerspectives,
}: AiAssistSectionProps) {
  const headingId = useId();
  const summaryReasonId = useId();
  const importanceReasonId = useId();
  const childReasonId = useId();
  const classifyReasonId = useId();
  const duplicatesReasonId = useId();
  const perspectivesReasonId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">AI支援</h2>
      <p className="text-xs text-zinc-600 dark:text-zinc-300">
        選んだ枝のラベルとメモを外部の AI に送り、提案を確かめてから適用します。
      </p>
      <EntryButton label="枝を要約してメモに入れる…" entry={summary} buttonRef={summaryButtonRef} reasonId={summaryReasonId} onOpen={onOpenSummary} />
      <EntryButton label="重要度を提案…" entry={importance} buttonRef={importanceButtonRef} reasonId={importanceReasonId} onOpen={onOpenImportance} />
      <EntryButton label="子の候補を提案…" entry={childCandidates} buttonRef={childCandidatesButtonRef} reasonId={childReasonId} onOpen={onOpenChildCandidates} />
      <EntryButton label="分類・並べ替えを提案…" entry={classifyReorder} buttonRef={classifyReorderButtonRef} reasonId={classifyReasonId} onOpen={onOpenClassifyReorder} />
      <EntryButton label="重複・類似を検出…" entry={duplicates} buttonRef={duplicatesButtonRef} reasonId={duplicatesReasonId} onOpen={onOpenDuplicates} />
      <EntryButton label="不足観点を提案…" entry={missingPerspectives} buttonRef={missingPerspectivesButtonRef} reasonId={perspectivesReasonId} onOpen={onOpenMissingPerspectives} />
    </section>
  );
}
