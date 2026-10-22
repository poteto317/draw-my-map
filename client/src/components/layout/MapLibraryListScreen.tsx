import { mapLibraryListButtonAttributes } from "@/components/layout/mapLibraryListButtons";
import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
import { formatMapUpdatedAt } from "@/domain/mapLibrary/mapTimestamp";

type MapLibraryListScreenProps = {
  headingId: string;
  maps: readonly MapIndexEntry[]; // 表示順
  currentMapId: string;
  onOpenCreate: () => void;
  onClose: () => void;
  onSwitch: (mapId: string) => void;
  onOpenRename: (mapId: string) => void;
  onOpenDelete: (mapId: string) => void;
};

const buttonClassName = "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-zinc-700 dark:text-zinc-200";

export function MapLibraryListScreen({
  headingId,
  maps,
  currentMapId,
  onOpenCreate,
  onClose,
  onSwitch,
  onOpenRename,
  onOpenDelete,
}: MapLibraryListScreenProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id={headingId} className="text-base font-semibold">
          マップ一覧
        </h2>
        <button
          type="button"
          className={buttonClassName}
          {...mapLibraryListButtonAttributes({ kind: "listCreateButton" })}
          onClick={onOpenCreate}
        >
          新しいマップ
        </button>
      </div>
      <ul
        aria-label="保存済みのマップ"
        className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto"
      >
        {maps.map((map) => {
          const isCurrent = map.id === currentMapId;
          return (
            <li
              key={map.id}
              className="flex flex-col gap-1 rounded-md border border-zinc-200 p-2 dark:border-zinc-700"
            >
              <button
                type="button"
                className="rounded-md px-1 text-left text-sm font-medium break-words [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                {...mapLibraryListButtonAttributes({ kind: "row", mapId: map.id, action: "open" })}
                aria-current={isCurrent ? "true" : undefined}
                onClick={() => onSwitch(map.id)}
              >
                {map.name}
                {isCurrent && "（開いています）"}
              </button>
              <span className="px-1 text-xs text-zinc-600 dark:text-zinc-400">
                {formatMapUpdatedAt(map.updatedAt)}
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClassName}
                  aria-label={`名前を変更: ${map.name}`}
                  {...mapLibraryListButtonAttributes({ kind: "row", mapId: map.id, action: "rename" })}
                  onClick={() => onOpenRename(map.id)}
                >
                  名前を変更
                </button>
                <button
                  type="button"
                  className={buttonClassName}
                  aria-label={`削除: ${map.name}`}
                  {...mapLibraryListButtonAttributes({ kind: "row", mapId: map.id, action: "delete" })}
                  onClick={() => onOpenDelete(map.id)}
                >
                  削除
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex justify-end">
        <button type="button" className={buttonClassName} onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
