"use client";

import { type MouseEvent, type Ref } from "react";
import { suppressBackupRestoreActionKey } from "@/components/layout/suppressBackupRestoreActionKey";

const buttonClassName = "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-zinc-700 dark:text-zinc-200";

type Props = {
  cancelButtonRef: Ref<HTMLButtonElement>;
  confirmText: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function MapLibraryConfirmActions({ cancelButtonRef, confirmText, onConfirm, onCancel }: Props) {
  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail > 1) return;
    onConfirm();
  };
  return (
    <div className="flex justify-end gap-2">
      <button ref={cancelButtonRef} type="button" className={buttonClassName} onKeyDown={suppressBackupRestoreActionKey} onClick={onCancel}>キャンセル</button>
      <button type="button" className={buttonClassName} onKeyDown={suppressBackupRestoreActionKey} onClick={onClick}>{confirmText}</button>
    </div>
  );
}
