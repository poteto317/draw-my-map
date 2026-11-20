"use client";

import type { Ref } from "react";
import {
  folderScreenButtonClassName,
  folderScreenDangerButtonClassName,
  guardSingleClick,
} from "@/components/layout/mapFolderScreenControls";
import { suppressBackupRestoreActionKey } from "@/components/layout/suppressBackupRestoreActionKey";
import type { MapFolder } from "@/domain/mapLibrary/mapLibraryMeta";

type MapFolderDeleteConfirmScreenProps = {
  headingId: string;
  descriptionId: string;
  target: MapFolder;
  mapCount: number;
  disabled: boolean;
  cancelButtonRef: Ref<HTMLButtonElement>;
  onConfirm: () => void;
  onCancel: () => void;
};

export function MapFolderDeleteConfirmScreen({
  headingId,
  descriptionId,
  target,
  mapCount,
  disabled,
  cancelButtonRef,
  onConfirm,
  onCancel,
}: MapFolderDeleteConfirmScreenProps) {
  return (
    <div className="flex flex-col gap-3">
      <h2 id={headingId} className="text-base font-semibold">
        フォルダーを削除
      </h2>
      <div
        id={descriptionId}
        className="flex flex-col gap-1 text-sm break-words [overflow-wrap:anywhere]"
      >
        <p>
          フォルダー「{target.name}」を削除します。中のマップは削除されず『未分類』になります。
        </p>
        {mapCount > 0 && (
          <p>現在 {mapCount} 件のマップがこのフォルダーに所属しています。</p>
        )}
      </div>
      {/* 安全側の「キャンセル」を先頭に置き既定フォーカスとする（L-408） */}
      <div className="flex flex-wrap justify-end gap-2">
        <button
          ref={cancelButtonRef}
          type="button"
          className={folderScreenButtonClassName}
          onKeyDown={suppressBackupRestoreActionKey}
          onClick={guardSingleClick(onCancel)}
        >
          キャンセル
        </button>
        <button
          type="button"
          disabled={disabled}
          className={folderScreenDangerButtonClassName}
          onKeyDown={suppressBackupRestoreActionKey}
          onClick={guardSingleClick(() => {
            if (!disabled) onConfirm();
          })}
        >
          このフォルダーを削除
        </button>
      </div>
    </div>
  );
}
