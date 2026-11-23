"use client";

import { useId, useLayoutEffect, useRef } from "react";
import { handleDialogClickCapture } from "@/components/layout/dialogClickCapture";
import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";
import { useDialogFocusTrap } from "@/components/layout/useDialogFocusTrap";
import { useReannouncedNotice } from "@/components/layout/useReannouncedNotice";
import type { BranchExtractError, BranchExtractFocusRequest } from "@/hooks/branchExtractDialogState";

type BranchExtractDialogProps = {
  displayLabel: string;
  canSubmit: boolean;
  error: BranchExtractError;
  focusRequest: BranchExtractFocusRequest;
  onFocusRequestApplied: () => void;
  onCancel: () => void;
  onSubmit: () => void;
  onMouseClick: () => void;
};

export function BranchExtractDialog({
  displayLabel,
  canSubmit,
  error,
  focusRequest,
  onFocusRequestApplied,
  onCancel,
  onSubmit,
  onMouseClick,
}: BranchExtractDialogProps) {
  const headingId = useId();
  const descriptionId = useId();
  const irreversibleNoteId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  useDialogFocusTrap({ dialogRef, overlayRef, onEscape: onCancel });
  const shownError = useReannouncedNotice(error.sequence, error);

  useLayoutEffect(() => {
    if (focusRequest !== "dialog") return;
    submitRef.current?.focus();
    onFocusRequestApplied();
  }, [focusRequest, onFocusRequestApplied]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClickCapture={(event) => handleDialogClickCapture(event, onMouseClick)}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="flex max-h-full w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-lg bg-white p-4 text-zinc-900 shadow-lg dark:bg-zinc-800 dark:text-zinc-100"
      >
        <h2 id={headingId} className="text-lg font-semibold">枝を別マップに切り出す</h2>
        <p id={descriptionId} className="text-sm">
          選択したノード「{displayLabel}」とすべての子孫を新しいマップへ切り出し、元の位置にリンク付きのスタブを残します。
        </p>
        <p id={irreversibleNoteId} className="text-sm font-medium">
          枝の切り出しは元に戻せません。切り出し後に新しいマップを開きます。
        </p>
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">{shownError?.message ?? ""}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded border px-3 py-2 text-sm">キャンセル</button>
          <button
            ref={submitRef}
            type="button"
            disabled={!canSubmit}
            aria-describedby={irreversibleNoteId}
            onClick={onSubmit}
            onKeyDown={preventRepeatedActivationClick}
            className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-40"
          >
            切り出す
          </button>
        </div>
      </div>
    </div>
  );
}