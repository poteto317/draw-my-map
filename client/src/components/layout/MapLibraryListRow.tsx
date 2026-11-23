"use client";

import { mapLibraryListButtonAttributes } from "@/components/layout/mapLibraryListButtons";
import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
import {
  type MapFolder,
  type MapListTab,
  type MapUserMeta,
} from "@/domain/mapLibrary/mapLibraryMeta";
import {
  formatMapArchivedAt,
  formatMapLastOpenedAt,
  formatMapUpdatedAt,
} from "@/domain/mapLibrary/mapTimestamp";

type MapLibraryListRowProps = {
  map: MapIndexEntry;
  isCurrent: boolean;
  userMeta: MapUserMeta | undefined;
  folders: readonly MapFolder[];
  folderName: string | undefined;
  listTab: MapListTab;
  isMetaWriteDisabled: boolean;
  buttonClassName: string;
  selectClassName: string;
  onToggleFavorite: (mapId: string) => void;
  onAssignFolder: (mapId: string, folderId: string | null) => void;
  onSwitch: (mapId: string) => void;
  onOpenRename: (mapId: string) => void;
  onOpenDelete: (mapId: string) => void;
  onArchive: (mapId: string) => void;
  onUnarchive: (mapId: string) => void;
};

export function MapLibraryListRow({
  map,
  isCurrent,
  userMeta,
  folders,
  folderName,
  listTab,
  isMetaWriteDisabled,
  buttonClassName,
  selectClassName,
  onToggleFavorite,
  onAssignFolder,
  onSwitch,
  onOpenRename,
  onOpenDelete,
  onArchive,
  onUnarchive,
}: MapLibraryListRowProps) {
  const isFavorite = userMeta?.favorite === true;
  const folderId = userMeta?.folderId;
  const timestampText =
    listTab === "archived" && userMeta?.archivedAt !== undefined
      ? formatMapArchivedAt(userMeta.archivedAt)
      : listTab === "recent" && userMeta?.lastOpenedAt !== undefined
        ? formatMapLastOpenedAt(userMeta.lastOpenedAt)
        : formatMapUpdatedAt(map.updatedAt);

  return (
    <li className="flex flex-col gap-1 rounded-md border border-zinc-200 p-2 dark:border-zinc-700">
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          disabled={isMetaWriteDisabled}
          aria-pressed={isFavorite}
          // 名前は状態によらず固定し、状態は aria-pressed だけで伝える（重要度・表示の切り替えボタンと同じ）
          aria-label={`お気に入り: ${map.name}`}
          className="shrink-0 rounded-md px-1.5 py-0.5 text-sm leading-none text-amber-500 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:text-amber-400"
          onClick={() => onToggleFavorite(map.id)}
        >
          {isFavorite ? "★" : "☆"}
        </button>
        <button
          type="button"
          className="min-w-0 flex-1 rounded-md px-1 text-left text-sm font-medium break-words [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          {...mapLibraryListButtonAttributes({
            kind: "row",
            mapId: map.id,
            action: "open",
          })}
          aria-current={isCurrent ? "true" : undefined}
          onClick={() => onSwitch(map.id)}
        >
          {map.name}
          {folderName !== undefined && (
            <span className="ml-1.5 inline-block rounded bg-zinc-200 px-1.5 py-0.5 text-xs font-normal text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
              {folderName}
            </span>
          )}
          {isCurrent && "（開いています）"}
        </button>
      </div>
      <span className="px-1 text-xs text-zinc-600 dark:text-zinc-400">
        {timestampText}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={`${map.name}のフォルダー`}
          value={folderName !== undefined && folderId !== undefined ? folderId : ""}
          disabled={isMetaWriteDisabled}
          className={selectClassName}
          onChange={(event) =>
            onAssignFolder(
              map.id,
              event.target.value === "" ? null : event.target.value,
            )
          }
        >
          <option value="">未分類</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={buttonClassName}
          aria-label={`名前を変更: ${map.name}`}
          {...mapLibraryListButtonAttributes({
            kind: "row",
            mapId: map.id,
            action: "rename",
          })}
          onClick={() => onOpenRename(map.id)}
        >
          名前を変更
        </button>
        {listTab === "archived" ? (
          <button
            type="button"
            className={buttonClassName}
            disabled={isMetaWriteDisabled}
            aria-label={`アーカイブ解除: ${map.name}`}
            {...mapLibraryListButtonAttributes({
              kind: "row",
              mapId: map.id,
              action: "unarchive",
            })}
            onClick={() => onUnarchive(map.id)}
          >
            アーカイブ解除
          </button>
        ) : (
          <button
            type="button"
            className={buttonClassName}
            disabled={isMetaWriteDisabled}
            aria-label={`アーカイブ: ${map.name}`}
            {...mapLibraryListButtonAttributes({
              kind: "row",
              mapId: map.id,
              action: "archive",
            })}
            onClick={() => onArchive(map.id)}
          >
            アーカイブ
          </button>
        )}
        <button
          type="button"
          className={buttonClassName}
          aria-label={`削除: ${map.name}`}
          {...mapLibraryListButtonAttributes({
            kind: "row",
            mapId: map.id,
            action: "delete",
          })}
          onClick={() => onOpenDelete(map.id)}
        >
          削除
        </button>
      </div>
    </li>
  );
}
