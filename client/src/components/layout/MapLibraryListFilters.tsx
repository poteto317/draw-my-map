"use client";

import {
  decodeFolderFilterValue,
  encodeFolderFilterValue,
} from "@/components/layout/mapListFolderFilterValue";
import type {
  MapFolder,
  MapListFolderFilter,
  MapListTab,
} from "@/domain/mapLibrary/mapLibraryMeta";

const LIST_TABS: readonly { readonly id: MapListTab; readonly label: string }[] = [
  { id: "all", label: "すべて" },
  { id: "favorites", label: "お気に入り" },
  { id: "recent", label: "最近使用" },
];

const activeTabButtonClassName =
  "shrink-0 rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-blue-500";

type MapLibraryListFiltersProps = {
  listTab: MapListTab;
  folderFilter: MapListFolderFilter;
  folders: readonly MapFolder[];
  buttonClassName: string;
  selectClassName: string;
  onChangeListTab: (tab: MapListTab) => void;
  onChangeFolderFilter: (filter: MapListFolderFilter) => void;
};

// マップ一覧の表示の切り替え（タブ）とフォルダーでの絞り込み
export function MapLibraryListFilters({
  listTab,
  folderFilter,
  folders,
  buttonClassName,
  selectClassName,
  onChangeListTab,
  onChangeFolderFilter,
}: MapLibraryListFiltersProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap gap-1" role="group" aria-label="表示の切り替え">
        {LIST_TABS.map((tab) => {
          const pressed = listTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-pressed={pressed}
              className={pressed ? activeTabButtonClassName : buttonClassName}
              onClick={() => onChangeListTab(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <select
        aria-label="フォルダーで絞り込み"
        value={encodeFolderFilterValue(folderFilter)}
        className={`${selectClassName} truncate`}
        onChange={(event) => onChangeFolderFilter(decodeFolderFilterValue(event.target.value))}
      >
        <option value="all">すべてのフォルダー</option>
        <option value="unclassified">未分類</option>
        {folders.map((folder) => (
          <option
            key={folder.id}
            value={encodeFolderFilterValue({ kind: "folder", folderId: folder.id })}
          >
            {folder.name}
          </option>
        ))}
      </select>
    </div>
  );
}
