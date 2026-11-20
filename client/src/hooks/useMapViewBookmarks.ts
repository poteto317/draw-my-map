import { useEffect, useState } from "react";
import {
  mapViewBookmarkFailureNotice,
  mapViewBookmarkReadFailedNotice,
} from "@/domain/mapLibrary/mapViewBookmarkMessages";
import type { MapLibraryStorage } from "@/services/persistence/mapLibraryStorage";
import {
  mapViewBookmarkKey,
  readMapViewBookmarks,
  updateMapViewBookmarks,
  type MapViewBookmark,
} from "@/services/persistence/mapViewBookmarkStorage";
import type { MapViewSnapshot } from "@/types/mapViewSnapshot";
import type { OperationNotice } from "@/types/operationNotice";

type BookmarkState = {
  storage: MapLibraryStorage;
  key: string;
  bookmarks: readonly MapViewBookmark[];
  notice: OperationNotice | null;
};

const EMPTY_BOOKMARKS: readonly MapViewBookmark[] = [];

export function useMapViewBookmarks(
  storage: MapLibraryStorage, id: string, createdAt: string, enabled: boolean,
) {
  const key = enabled ? mapViewBookmarkKey({ id, createdAt }) : null;
  const [state, setState] = useState<BookmarkState | null>(null);
  const current = state !== null && state.storage === storage && state.key === key ? state : null;

  useEffect(() => {
    if (key === null) return;
    const result = readMapViewBookmarks(storage, { id, createdAt });
    setState({
      storage, key,
      bookmarks: result.ok ? result.bookmarks : EMPTY_BOOKMARKS,
      notice: result.ok ? null : mapViewBookmarkReadFailedNotice(),
    });
  }, [key, storage, id, createdAt]);

  function update(change: { kind: "save"; name: string; snapshot: MapViewSnapshot } | { kind: "delete"; name: string }) {
    if (key === null || current === null) return false;
    const result = updateMapViewBookmarks(storage, { id, createdAt }, change);
    if (result.ok) {
      setState({ storage, key, bookmarks: result.bookmarks, notice: null });
      return true;
    }

    setState({ ...current, notice: mapViewBookmarkFailureNotice(result.reason, change.kind) });
    return false;
  }

  return {
    key,
    ready: current !== null,
    bookmarks: current?.bookmarks ?? EMPTY_BOOKMARKS,
    notice: current?.notice ?? null,
    save: (name: string, snapshot: MapViewSnapshot) => update({ kind: "save", name, snapshot }),
    remove: (name: string) => update({ kind: "delete", name }),
  };
}
