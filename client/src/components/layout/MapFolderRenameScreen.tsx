"use client";

import { useId, useLayoutEffect, useRef, useState, type FormEvent, type Ref } from "react";
import {
  folderScreenButtonClassName,
  folderScreenInputClassName,
  suppressFormInputEnterKey,
} from "@/components/layout/mapFolderScreenControls";
import {
  formatMapFolderFailure,
  validateRenameMapFolderName,
  type MapFolder,
} from "@/domain/mapLibrary/mapLibraryMeta";

function validateFolderNameForRename(
  rawName: string,
  targetId: string,
  folders: readonly MapFolder[],
): string | null {
  const result = validateRenameMapFolderName(folders, targetId, rawName);
  return result.ok ? null : formatMapFolderFailure(result.reason);
}

type MapFolderRenameScreenProps = {
  headingId: string;
  target: MapFolder;
  folders: readonly MapFolder[];
  disabled: boolean;
  inputRef: Ref<HTMLInputElement>;
  onSubmit: (nameInput: string) => void;
  onCancel: () => void;
};

export function MapFolderRenameScreen({
  headingId,
  target,
  folders,
  disabled,
  inputRef,
  onSubmit,
  onCancel,
}: MapFolderRenameScreenProps) {
  const inputId = useId();
  const errorId = useId();
  const [nameInput, setNameInput] = useState(target.name);
  const [submittedOnce, setSubmittedOnce] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useLayoutEffect(() => {
    if (!disabled) formRef.current?.querySelector("input")?.select();
  }, [disabled]);

  const validationError = validateFolderNameForRename(nameInput, target.id, folders);
  const shownError = submittedOnce || nameInput !== target.name ? validationError : null;

  // 確定は送信の 1 箇所のみで行い、blur では確定しない（L-473）
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;
    setSubmittedOnce(true);
    if (validationError !== null) return;
    onSubmit(nameInput);
  };

  return (
    <form ref={formRef} className="flex flex-col gap-3" noValidate onSubmit={handleSubmit}>
      <h2 id={headingId} className="text-base font-semibold">
        フォルダー名を変更
      </h2>
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-sm font-medium">
          フォルダー名
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={nameInput}
          disabled={disabled}
          aria-invalid={shownError === null ? undefined : "true"}
          aria-describedby={shownError === null ? undefined : errorId}
          className={folderScreenInputClassName}
          onChange={(event) => setNameInput(event.target.value)}
          onKeyDown={suppressFormInputEnterKey}
        />
        {shownError !== null && (
          <p id={errorId} role="alert" className="text-sm text-red-700 dark:text-red-300">
            {shownError}
          </p>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <button type="submit" disabled={disabled} className={folderScreenButtonClassName}>
          変更
        </button>
        <button type="button" className={folderScreenButtonClassName} onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </form>
  );
}
