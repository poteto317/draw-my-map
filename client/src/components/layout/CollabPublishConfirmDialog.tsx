"use client";

import { COLLAB_MESSAGES } from "@/domain/collab/collabMessages";
import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";

export type CollabPublishConfirmDialogProps = {
  open: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
  dialogMouseClickedAtRef: React.RefObject<number | null>;
};

/** end 成功後の任意「公開を更新しますか？」（自動 publish しない） */
export function CollabPublishConfirmDialog({
  open,
  onConfirm,
  onDismiss,
  dialogMouseClickedAtRef,
}: CollabPublishConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="collab-publish-confirm-title"
      data-testid="collab-publish-confirm"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={() => {
        dialogMouseClickedAtRef.current = Date.now();
      }}
    >
      <div className="max-w-md rounded-lg bg-white p-5 shadow-lg dark:bg-zinc-800">
        <h2
          id="collab-publish-confirm-title"
          className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
        >
          {COLLAB_MESSAGES.publishConfirmTitle}
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          {COLLAB_MESSAGES.publishConfirmBody}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm dark:bg-zinc-700"
            onClick={onDismiss}
            onKeyDown={preventRepeatedActivationClick}
          >
            {COLLAB_MESSAGES.publishConfirmNo}
          </button>
          <button
            type="button"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
            onClick={onConfirm}
            onKeyDown={preventRepeatedActivationClick}
          >
            {COLLAB_MESSAGES.publishConfirmYes}
          </button>
        </div>
      </div>
    </div>
  );
}
