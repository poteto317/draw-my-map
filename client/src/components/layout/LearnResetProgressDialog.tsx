"use client";

import { useId, useLayoutEffect, useRef } from "react";
import { handleDialogClickCapture } from "@/components/layout/dialogClickCapture";
import { useDialogFocusTrap } from "@/components/layout/useDialogFocusTrap";

type LearnResetProgressDialogProps = {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onMouseClick?: () => void;
};

export function LearnResetProgressDialog({
  open,
  onConfirm,
  onCancel,
  onMouseClick = () => {},
}: LearnResetProgressDialogProps) {
  const headingId = useId();
  const descriptionId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useDialogFocusTrap({ dialogRef, overlayRef, onEscape: onCancel });

  useLayoutEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClickCapture={(event) => handleDialogClickCapture(event, onMouseClick)}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg dark:bg-zinc-900"
      >
        <h2 id={headingId} className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          学習の進捗をリセット
        </h2>
        <p id={descriptionId} className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          開示済みのラベルをすべて隠します。この操作は元に戻せます。
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
            onClick={onCancel}
          >
            キャンセル
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
            onClick={onConfirm}
          >
            リセット
          </button>
        </div>
      </div>
    </div>
  );
}