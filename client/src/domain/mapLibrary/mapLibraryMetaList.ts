import { sortMapEntriesForDisplay, type MapIndexEntry } from "./mapIndex";
import {
  getMapUserMeta,
  isMapArchived,
  MAX_RECENT_MAPS,
  type MapLibraryMetaV1,
  type MapListFilter,
  type MapListFolderFilter,
  type MapUserMeta,
} from "./mapLibraryMetaModel";

function toTimestampMs(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

function matchesFolderFilter(
  userMeta: MapUserMeta | undefined,
  folderFilter: MapListFolderFilter,
): boolean {
  switch (folderFilter.kind) {
    case "all":
      return true;
    case "unclassified":
      return userMeta?.folderId === undefined;
    case "folder":
      return userMeta?.folderId === folderFilter.folderId;
    default: {
      const unreachable: never = folderFilter;
      return unreachable;
    }
  }
}

// 先に folderFilter で絞り込み、次に tab で絞り込み・並べ替える。原本 maps は破壊しない（L-460）
export function filterAndSortMapsForList(
  maps: readonly MapIndexEntry[],
  meta: MapLibraryMetaV1,
  filter: MapListFilter,
): MapIndexEntry[] {
  const folderFiltered = maps.filter((entry) =>
    matchesFolderFilter(getMapUserMeta(meta, entry.id), filter.folderFilter),
  );

  switch (filter.tab) {
    case "all":
      return sortMapEntriesForDisplay(
        folderFiltered.filter(
          (entry) => !isMapArchived(getMapUserMeta(meta, entry.id)),
        ),
      );
    case "favorites":
      return sortMapEntriesForDisplay(
        folderFiltered.filter(
          (entry) => {
            const userMeta = getMapUserMeta(meta, entry.id);
            return userMeta?.favorite === true && !isMapArchived(userMeta);
          },
        ),
      );
    case "recent": {
      const opened = folderFiltered.filter(
        (entry) => {
          const userMeta = getMapUserMeta(meta, entry.id);
          return userMeta?.lastOpenedAt !== undefined && !isMapArchived(userMeta);
        },
      );
      opened.sort((a, b) => {
        const aTime = toTimestampMs(
          getMapUserMeta(meta, a.id)?.lastOpenedAt ?? "",
        );
        const bTime = toTimestampMs(
          getMapUserMeta(meta, b.id)?.lastOpenedAt ?? "",
        );
        if (bTime !== aTime) {
          return bTime - aTime;
        }
        if (a.id === b.id) return 0;
        return a.id < b.id ? -1 : 1;
      });
      return opened.slice(0, MAX_RECENT_MAPS);
    }
    case "archived": {
      const archived = folderFiltered.filter((entry) =>
        isMapArchived(getMapUserMeta(meta, entry.id)),
      );
      archived.sort((a, b) => {
        const aTime = toTimestampMs(
          getMapUserMeta(meta, a.id)?.archivedAt ?? "",
        );
        const bTime = toTimestampMs(
          getMapUserMeta(meta, b.id)?.archivedAt ?? "",
        );
        if (bTime !== aTime) {
          return bTime - aTime;
        }
        if (a.id === b.id) return 0;
        return a.id < b.id ? -1 : 1;
      });
      return archived;
    }
    default: {
      const unreachable: never = filter.tab;
      return unreachable;
    }
  }
}

// フォルダーごとの所属マップ数。一覧（maps）にあるマップだけを数え、未分類は含めない
export function countMapsByFolder(
  maps: readonly MapIndexEntry[],
  meta: MapLibraryMetaV1,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const map of maps) {
    const folderId = getMapUserMeta(meta, map.id)?.folderId;
    if (folderId !== undefined) {
      counts.set(folderId, (counts.get(folderId) ?? 0) + 1);
    }
  }
  return counts;
}
