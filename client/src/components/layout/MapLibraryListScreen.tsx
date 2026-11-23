"use client";

import { useRef, useState } from "react";
import { mapLibraryListButtonAttributes } from "@/components/layout/mapLibraryListButtons";
import { MapLibraryListFilters } from "@/components/layout/MapLibraryListFilters";
import { MapLibraryListRow } from "@/components/layout/MapLibraryListRow";
import { MapLibraryMetaStatusNotice } from "@/components/layout/MapLibraryMetaStatusNotice";
import { suppressBackupRestoreActionKey } from "@/components/layout/suppressBackupRestoreActionKey";
import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
import {
  filterAndSortMapsForList,
  getMapUserMeta,
  type MapLibraryMetaStatus,
  type MapLibraryMetaV1,
  type MapListFolderFilter,
  type MapListTab,
} from "@/domain/mapLibrary/mapLibraryMeta";

type MapLibraryListScreenProps = {
  headingId: string;
  maps: readonly MapIndexEntry[]; // 表示順
  currentMapId: string;
  libraryMeta: MapLibraryMetaV1;
  libraryMetaStatus: MapLibraryMetaStatus;
  listTab: MapListTab;
  folderFilter: MapListFolderFilter;
  onChangeListTab: (tab: MapListTab) => void;
  onChangeFolderFilter: (filter: MapListFolderFilter) => void;
  onOpenFolders: () => void;
  onToggleFavorite: (mapId: string) => void;
  onArchiveMap: (mapId: string) => void;
  onUnarchiveMap: (mapId: string) => void;
  onAssignFolder: (mapId: string, folderId: string | null) => void;
  onResetLibraryMeta: () => void;
  onOpenCreate: () => void;
  onClose: () => void;
  onSwitch: (mapId: string) => void;
  onOpenRename: (mapId: string) => void;
  onOpenDelete: (mapId: string) => void;
  onPrepareBackup: () => void;
  onSelectRestoreFile: (file: File) => void;
  trashCount: number;
  trashStatus: "ok" | "corrupt";
  onOpenTrash: () => void;
  onOpenBrokenLinks: () => void;
  storageMode: "persistent" | "protected";
};

function trashButtonLabel(trashCount: number, trashStatus: "ok" | "corrupt"): string {
  if (trashStatus === "corrupt") return "ゴミ箱（要確認）";
  return trashCount > 0 ? `ゴミ箱（${trashCount}）` : "ゴミ箱";
}

const buttonClassName =
  "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-zinc-700 dark:text-zinc-200";

// 長いフォルダー名（最大 50 コードポイント）でもダイアログの幅を超えないよう、親の幅で縮める（NodeMapLinksSection と同じ min-w-0）
const selectClassName =
  "min-w-0 max-w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100";

export function MapLibraryListScreen({
  headingId,
  maps,
  currentMapId,
  libraryMeta,
  libraryMetaStatus,
  listTab,
  folderFilter,
  onChangeListTab,
  onChangeFolderFilter,
  onOpenFolders,
  onToggleFavorite,
  onArchiveMap,
  onUnarchiveMap,
  onAssignFolder,
  onResetLibraryMeta,
  onOpenCreate,
  onClose,
  onSwitch,
  onOpenRename,
  onOpenDelete,
  onPrepareBackup,
  onSelectRestoreFile,
  trashCount,
  trashStatus,
  onOpenTrash,
  onOpenBrokenLinks,
  storageMode,
}: MapLibraryListScreenProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [protectedNotice, setProtectedNotice] = useState("");
  const isProtected = storageMode === "protected";
  const isMetaWriteDisabled = isProtected || libraryMetaStatus !== "ready";
  const rejectProtected = () =>
    setProtectedNotice(
      "保護モードでは操作できません。現在のマップを「JSON書き出し」で救出してください。",
    );

  const filteredMaps = filterAndSortMapsForList(maps, libraryMeta, {
    tab: listTab,
    folderFilter,
  });
  const folderNameById = new Map(
    libraryMeta.folders.map((folder) => [folder.id, folder.name]),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="text-base font-semibold">
          マップ一覧
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={buttonClassName}
            {...mapLibraryListButtonAttributes({ kind: "listCreateButton" })}
            onClick={onOpenCreate}
          >
            新しいマップ
          </button>
          <button
            type="button"
            className={buttonClassName}
            disabled={isMetaWriteDisabled}
            {...mapLibraryListButtonAttributes({ kind: "folderButton" })}
            onKeyDown={suppressBackupRestoreActionKey}
            onClick={(event) => {
              if (event.detail > 1) return;
              if (isMetaWriteDisabled) return;
              onOpenFolders();
            }}
          >
            フォルダー管理
          </button>
        </div>
      </div>

      {!isProtected && (
        <MapLibraryMetaStatusNotice
          status={libraryMetaStatus}
          buttonClassName={buttonClassName}
          onReset={onResetLibraryMeta}
        />
      )}

      <MapLibraryListFilters
        listTab={listTab}
        folderFilter={folderFilter}
        folders={libraryMeta.folders}
        buttonClassName={buttonClassName}
        selectClassName={selectClassName}
        onChangeListTab={onChangeListTab}
        onChangeFolderFilter={onChangeFolderFilter}
      />

      {filteredMaps.length === 0 ? (
        <p className="py-4 text-center text-sm text-zinc-600 dark:text-zinc-400">
          該当するマップはありません
        </p>
      ) : (
        <ul
          aria-label="保存済みのマップ"
          className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto"
        >
          {filteredMaps.map((map) => {
            const userMeta = getMapUserMeta(libraryMeta, map.id);
            const folderId = userMeta?.folderId;
            return (
              <MapLibraryListRow
                key={map.id}
                map={map}
                isCurrent={map.id === currentMapId}
                userMeta={userMeta}
                folders={libraryMeta.folders}
                folderName={folderId !== undefined ? folderNameById.get(folderId) : undefined}
                listTab={listTab}
                isMetaWriteDisabled={isMetaWriteDisabled}
                buttonClassName={buttonClassName}
                selectClassName={selectClassName}
                onToggleFavorite={onToggleFavorite}
                onArchive={onArchiveMap}
                onUnarchive={onUnarchiveMap}
                onAssignFolder={onAssignFolder}
                onSwitch={onSwitch}
                onOpenRename={onOpenRename}
                onOpenDelete={onOpenDelete}
              />
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClassName}
          data-map-library-action="brokenLinks"
          onKeyDown={suppressBackupRestoreActionKey}
          onClick={(event) => {
            if (event.detail > 1) return;
            if (isProtected) {
              rejectProtected();
              return;
            }
            onOpenBrokenLinks();
          }}
        >
          リンク切れを確認
        </button>
        <button
          type="button"
          className={buttonClassName}
          data-map-library-action="trash"
          onKeyDown={suppressBackupRestoreActionKey}
          onClick={(event) => {
            if (event.detail > 1) return;
            if (isProtected) {
              rejectProtected();
              return;
            }
            onOpenTrash();
          }}
        >
          {trashButtonLabel(trashCount, trashStatus)}
        </button>
        <button
          type="button"
          className={buttonClassName}
          data-map-library-action="backup"
          onKeyDown={suppressBackupRestoreActionKey}
          onClick={() => (isProtected ? rejectProtected() : onPrepareBackup())}
        >
          全マップをバックアップ
        </button>
        <button
          type="button"
          className={buttonClassName}
          data-map-library-action="restore"
          onKeyDown={suppressBackupRestoreActionKey}
          onClick={() => (isProtected ? rejectProtected() : fileInputRef.current?.click())}
        >
          バックアップから復元
        </button>
        <input
          ref={fileInputRef}
          aria-label="バックアップファイル"
          type="file"
          accept=".json,application/json"
          className="hidden"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (isProtected) {
              rejectProtected();
              return;
            }
            if (file) onSelectRestoreFile(file);
          }}
        />
      </div>
      {protectedNotice && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {protectedNotice}
        </p>
      )}
      <div className="flex justify-end">
        <button type="button" className={buttonClassName} onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
