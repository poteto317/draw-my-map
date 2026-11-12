"use client";

import { useId, useLayoutEffect, useRef } from "react";
import { handleDialogClickCapture } from "@/components/layout/dialogClickCapture";
import { useDialogFocusTrap } from "@/components/layout/useDialogFocusTrap";
import {
  RELOAD_CONFIRM_ACTION_LABEL,
  RELOAD_CONFIRM_CANCEL_LABEL,
  RELOAD_CONFIRM_MESSAGE,
  RELOAD_CONFIRM_TITLE,
} from "@/domain/mapLibrary/mapConflictMessages";

export interface MapConflictConfirmDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onMouseClick?: () => void;
}

interface MapConflictConfirmDialogModalProps {
  onConfirm: () => void;
  onCancel: () => void;
  onMouseClick?: () => void;
}

function MapConflictConfirmDialogModal({
  onConfirm,
  onCancel,
  onMouseClick,
}: MapConflictConfirmDialogModalProps) {
  const headingId = useId();
  const descriptionId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useDialogFocusTrap({
    dialogRef,
    overlayRef,
    onEscape: onCancel,
  });

  // L-408: 初期フォーカスは安全側の「キャンセル」ボタンに当てる
  useLayoutEffect(() => {
    cancelButtonRef.current?.focus();
  }, []);

  // L-408: Enter/Space キーリピートによる誤確定・誤操作を抑止する
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.repeat && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
    }
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClickCapture={(event) => onMouseClick && handleDialogClickCapture(event, onMouseClick)}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="flex max-h-full w-full max-w-md flex-col gap-4 overflow-y-auto rounded-lg bg-white p-6 text-zinc-900 shadow-xl dark:bg-zinc-800 dark:text-zinc-100"
      >
        <h2 id={headingId} className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {RELOAD_CONFIRM_TITLE}
        </h2>
        <p id={descriptionId} className="text-sm text-zinc-600 dark:text-zinc-300">
          {RELOAD_CONFIRM_MESSAGE}
        </p>
        <div className="flex justify-end gap-3 pt-2">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
          >
            {RELOAD_CONFIRM_CANCEL_LABEL}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            onKeyDown={(event) => {
              if (event.repeat) {
                event.preventDefault();
              }
            }}
            className="rounded bg-rose-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 dark:bg-rose-600 dark:hover:bg-rose-700"
          >
            {RELOAD_CONFIRM_ACTION_LABEL}
          </button>
        </div>
      </div>
    </div>
  );
}

export function MapConflictConfirmDialog({
  isOpen,
  onConfirm,
  onCancel,
  onMouseClick,
}: MapConflictConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <MapConflictConfirmDialogModal
      onConfirm={onConfirm}
      onCancel={onCancel}
      onMouseClick={onMouseClick}
    />
  );
}
