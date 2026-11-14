"use client";

import type { MouseEvent } from "react";
import { suppressBackupRestoreActionKey } from "@/components/layout/suppressBackupRestoreActionKey";
import {
  formatMapDeletedAt,
  formatMapUpdatedAt,
} from "@/domain/mapLibrary/mapTimestamp";
import {
  formatTrashRemainingDays,
  TRASH_RETENTION_DAYS,
  type MapTrashEntry,
} from "@/domain/mapLibrary/mapTrash";
import { TRASH_CORRUPT_MESSAGE } from "@/domain/mapLibrary/mapTrashMessages";

type MapLibraryTrashScreenProps = {
  headingId: string;
  entries: readonly MapTrashEntry[];
  trashStatus: "ok" | "corrupt";
  now: Date;
  onRestore: (trashId: string) => void;
  onOpenPermanentDelete: (trashId: string) => void;
  onOpenEmptyTrash: () => void;
  onBackToList: () => void;
};

const buttonClassName = "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-zinc-700 dark:text-zinc-200";

function guardSingleClick(handler: () => void) {
  return (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail > 1) return;
    handler();
  };
}

export function MapLibraryTrashScreen({
  headingId,
  entries,
  trashStatus,
  now,
  onRestore,
  onOpenPermanentDelete,
  onOpenEmptyTrash,
  onBackToList,
}: MapLibraryTrashScreenProps) {
  const canEmpty = trashStatus === "corrupt" || entries.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <h2 id={headingId} className="text-base font-semibold">
        ゴミ箱
      </h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        削除したマップは {TRASH_RETENTION_DAYS} 日間保存されます。期限を過ぎると自動的に削除されます。
      </p>
      {trashStatus === "corrupt" ? (
        <p className="text-sm text-red-700 dark:text-red-300">
          {TRASH_CORRUPT_MESSAGE}
        </p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          ゴミ箱は空です。
        </p>
      ) : (
        <ul
          aria-label="ゴミ箱のマップ"
          className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto"
        >
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-col gap-1 rounded-md border border-zinc-200 p-2 dark:border-zinc-700"
            >
              <span className="px-1 text-sm font-medium break-words [overflow-wrap:anywhere]">
                {entry.name}
              </span>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-1 text-xs text-zinc-600 dark:text-zinc-400">
                <span>{formatMapDeletedAt(entry.deletedAt)}</span>
                <span>{formatMapUpdatedAt(entry.updatedAt)}</span>
                <span>{formatTrashRemainingDays(entry, now)}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClassName}
                  aria-label={`復元: ${entry.name}`}
                  data-trash-id={entry.id}
                  data-trash-action="restore"
                  onKeyDown={suppressBackupRestoreActionKey}
                  onClick={guardSingleClick(() => onRestore(entry.id))}
                >
                  復元
                </button>
                <button
                  type="button"
                  className={buttonClassName}
                  aria-label={`完全に削除: ${entry.name}`}
                  data-trash-id={entry.id}
                  data-trash-action="permanentDelete"
                  onKeyDown={suppressBackupRestoreActionKey}
                  onClick={guardSingleClick(() => onOpenPermanentDelete(entry.id))}
                >
                  完全に削除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {canEmpty && (
          <button
            type="button"
            className={buttonClassName}
            data-map-library-action="emptyTrash"
            onKeyDown={suppressBackupRestoreActionKey}
            onClick={guardSingleClick(onOpenEmptyTrash)}
          >
            ゴミ箱を空にする
          </button>
        )}
        <button
          type="button"
          className={buttonClassName}
          data-map-library-action="backToList"
          onKeyDown={suppressBackupRestoreActionKey}
          onClick={guardSingleClick(onBackToList)}
        >
          一覧に戻る
        </button>
      </div>
    </div>
  );
}
