"use client";

import { useId, useState, type FormEvent } from "react";
import {
  folderScreenButtonClassName,
  folderScreenInputClassName,
  guardSingleClick,
  suppressFormInputEnterKey,
} from "@/components/layout/mapFolderScreenControls";
import { mapLibraryFolderTargetAttributes } from "@/components/layout/mapLibraryListButtons";
import { suppressBackupRestoreActionKey } from "@/components/layout/suppressBackupRestoreActionKey";
import {
  formatMapFolderFailure,
  MAX_MAP_FOLDERS,
  validateCreateMapFolderName,
  type MapFolder,
} from "@/domain/mapLibrary/mapLibraryMeta";

function validateFolderNameForCreate(
  rawName: string,
  folders: readonly MapFolder[],
): string | null {
  const result = validateCreateMapFolderName(folders, rawName);
  return result.ok ? null : formatMapFolderFailure(result.reason);
}

type MapFolderManagerScreenProps = {
  headingId: string;
  folders: readonly MapFolder[];
  mapCountByFolderId: ReadonlyMap<string, number>;
  disabled: boolean;
  onCreateFolder: (nameInput: string) => boolean;
  onOpenRename: (folderId: string) => void;
  onOpenDelete: (folderId: string) => void;
  onBackToList: () => void;
};

export function MapFolderManagerScreen({
  headingId,
  folders,
  mapCountByFolderId,
  disabled,
  onCreateFolder,
  onOpenRename,
  onOpenDelete,
  onBackToList,
}: MapFolderManagerScreenProps) {
  const inputId = useId();
  const errorId = useId();
  const [nameInput, setNameInput] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const isAtLimit = folders.length >= MAX_MAP_FOLDERS;

  // 確定は送信の 1 箇所のみで行い、blur では確定しない（L-473）
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;
    const error = validateFolderNameForCreate(nameInput, folders);
    if (error !== null) {
      setLocalError(error);
      return;
    }
    setLocalError(null);
    if (onCreateFolder(nameInput)) {
      setNameInput("");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <h2 id={headingId} className="text-base font-semibold">
        フォルダー管理
      </h2>
      <form className="flex flex-col gap-2" noValidate onSubmit={handleSubmit}>
        <label htmlFor={inputId} className="text-sm font-medium">
          新しいフォルダー名
        </label>
        <div className="flex gap-2">
          <input
            id={inputId}
            type="text"
            value={nameInput}
            disabled={disabled}
            aria-invalid={localError === null ? undefined : "true"}
            aria-describedby={localError === null ? undefined : errorId}
            className={folderScreenInputClassName}
            {...mapLibraryFolderTargetAttributes({ kind: "folderCreateInput" })}
            onChange={(event) => {
              setNameInput(event.target.value);
              if (localError !== null) setLocalError(null);
            }}
            onKeyDown={suppressFormInputEnterKey}
          />
          <button type="submit" disabled={disabled} className={folderScreenButtonClassName}>
            作成
          </button>
        </div>
        {/* ライブリージョンは常に描画し、中身だけを替える */}
        <p role="status" className="text-xs text-zinc-600 dark:text-zinc-400">
          {isAtLimit ? `フォルダーは上限（${MAX_MAP_FOLDERS} 件）に達しています。` : ""}
        </p>
        {localError !== null && (
          <p id={errorId} role="alert" className="text-sm text-red-700 dark:text-red-300">
            {localError}
          </p>
        )}
      </form>
      {folders.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">フォルダーはまだありません。</p>
      ) : (
        <ul
          aria-label="登録済みのフォルダー"
          className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto"
        >
          {folders.map((folder) => {
            const count = mapCountByFolderId.get(folder.id) ?? 0;
            return (
              <li
                key={folder.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 p-2 dark:border-zinc-700"
              >
                <div className="min-w-0 flex-1">
                  <span className="block text-sm font-medium break-words [overflow-wrap:anywhere]">
                    {folder.name}
                  </span>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    {count} 件
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={disabled}
                    className={folderScreenButtonClassName}
                    aria-label={`名前を変更: ${folder.name}`}
                    {...mapLibraryFolderTargetAttributes({
                      kind: "folderRow",
                      folderId: folder.id,
                      action: "rename",
                    })}
                    onKeyDown={suppressBackupRestoreActionKey}
                    onClick={guardSingleClick(() => onOpenRename(folder.id))}
                  >
                    名前を変更
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    className={folderScreenButtonClassName}
                    aria-label={`削除: ${folder.name}`}
                    {...mapLibraryFolderTargetAttributes({
                      kind: "folderRow",
                      folderId: folder.id,
                      action: "delete",
                    })}
                    onKeyDown={suppressBackupRestoreActionKey}
                    onClick={guardSingleClick(() => onOpenDelete(folder.id))}
                  >
                    削除
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          className={folderScreenButtonClassName}
          data-map-library-action="backToList"
          onKeyDown={suppressBackupRestoreActionKey}
          onClick={guardSingleClick(onBackToList)}
        >
          マップ一覧に戻る
        </button>
      </div>
    </div>
  );
}
