import { decodeMapIndex, isValidMapId } from "@/domain/mapLibrary/mapIndex";
import { normalizeMapTimestamp, UNKNOWN_MAP_TIMESTAMP } from "@/domain/mapLibrary/mapTimestamp";
import { isRecord } from "@/domain/shared/unknownRecord";
import type { MapViewSnapshot } from "@/types/mapViewSnapshot";
import { isValidViewport, type Viewport } from "@/types/viewport";
import { MAP_INDEX_STORAGE_KEY, type MapLibraryStorage } from "./mapLibraryStorage";

type MapIdentity = { id: string; createdAt: string };
type TrashIdentity = { originalMapId: string; createdAt: string };

export type MapViewBookmark = { name: string; snapshot: MapViewSnapshot };
type BookmarkChange =
  | ({ kind: "save" } & MapViewBookmark)
  | { kind: "delete"; name: string };
type BookmarkFailure = { ok: false; reason: "unavailable" | "read" | "invalid" | "write" | "empty-name" | "duplicate-name" };
type BookmarkResult = { ok: true; bookmarks: readonly MapViewBookmark[] } | BookmarkFailure;

export function mapViewBookmarkKey({ id, createdAt }: MapIdentity): string | null {
  if (!isValidMapId(id) || normalizeMapTimestamp(createdAt).repaired || createdAt === UNKNOWN_MAP_TIMESTAMP) return null;
  return `draw-my-map:view-bookmarks:${id}:${createdAt}`;
}

function isViewport(value: unknown): value is Viewport {
  if (!isRecord(value)) return false;
  const { offsetX, offsetY, scale } = value;
  return typeof offsetX === "number" && typeof offsetY === "number" && typeof scale === "number"
    && isValidViewport({ offsetX, offsetY, scale });
}

function isNodeIdOrNull(value: unknown): boolean {
  return value === null || Number.isSafeInteger(value);
}

function isNodeIdList(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  for (const id of value) {
    if (!Number.isSafeInteger(id)) return false;
  }
  return true;
}

function isResolutionLevel(value: unknown): boolean {
  return value === "high" || value === "medium" || value === "all";
}

function isSnapshot(value: unknown): value is MapViewSnapshot {
  return isRecord(value) && isViewport(value.viewport) && isNodeIdOrNull(value.selectedNodeId)
    && isNodeIdOrNull(value.focusRootId) && isNodeIdList(value.selectedNodeIds)
    && isNodeIdList(value.collapsedNodeIds) && isResolutionLevel(value.autoResolutionLevel)
    && (value.resolutionMode === "auto" || isResolutionLevel(value.resolutionMode));
}

function isBookmark(value: unknown): value is MapViewBookmark {
  return isRecord(value) && typeof value.name === "string" && value.name.length > 0
    && value.name.trim() === value.name && isSnapshot(value.snapshot);
}

function decodeBookmarks(raw: string | null): BookmarkResult {
  if (raw === null) return { ok: true, bookmarks: [] };
  try {
    const value: unknown = JSON.parse(raw);
    if (isRecord(value) && value.version === 1 && Array.isArray(value.bookmarks)
      && value.bookmarks.every(isBookmark)
      && new Set(value.bookmarks.map(({ name }) => name)).size === value.bookmarks.length) {
      return { ok: true, bookmarks: value.bookmarks };
    }
  } catch {
    return { ok: false, reason: "invalid" };
  }
  return { ok: false, reason: "invalid" };
}

function readBookmarks(storage: MapLibraryStorage, key: string): BookmarkResult {
  try {
    return decodeBookmarks(storage.getItem(key));
  } catch {
    return { ok: false, reason: "read" };
  }
}

export function readMapViewBookmarks(storage: MapLibraryStorage, identity: MapIdentity): BookmarkResult {
  const key = mapViewBookmarkKey(identity);
  return key === null ? { ok: false, reason: "unavailable" } : readBookmarks(storage, key);
}

export function updateMapViewBookmarks(
  storage: MapLibraryStorage, identity: MapIdentity, change: BookmarkChange,
): BookmarkResult {
  const key = mapViewBookmarkKey(identity);
  if (key === null) return { ok: false, reason: "unavailable" };
  const current = readBookmarks(storage, key);
  if (!current.ok) return current;

  const name = change.name.trim();
  if (!name) return { ok: false, reason: "empty-name" };
  const existing = current.bookmarks.some((bookmark) => bookmark.name === name);
  let bookmarks: readonly MapViewBookmark[];
  if (change.kind === "save") {
    if (existing) return { ok: false, reason: "duplicate-name" };
    if (!isSnapshot(change.snapshot)) return { ok: false, reason: "invalid" };
    bookmarks = [...current.bookmarks, { name, snapshot: change.snapshot }];
  } else {
    if (!existing) return current;
    bookmarks = current.bookmarks.filter((bookmark) => bookmark.name !== name);
  }

  try {
    if (bookmarks.length === 0) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify({ version: 1, bookmarks }));
    return { ok: true, bookmarks };
  } catch {
    return { ok: false, reason: "write" };
  }
}

export function hasStoredMapViewBookmarks(storage: MapLibraryStorage, identity: MapIdentity): boolean {
  const key = mapViewBookmarkKey(identity);
  if (key === null) return false;
  try {
    return storage.getItem(key) !== null;
  } catch {
    return true;
  }
}

export function removeMapViewBookmarks(storage: MapLibraryStorage, identity: MapIdentity): boolean {
  const key = mapViewBookmarkKey(identity);
  if (key === null) return true;
  try {
    if (storage.getItem(key) !== null) storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function cleanupTrashedMapViewBookmarks(
  storage: MapLibraryStorage, deleted: readonly TrashIdentity[], remaining: readonly TrashIdentity[],
): boolean {
  if (deleted.length === 0) return true;
  try {
    const raw = storage.getItem(MAP_INDEX_STORAGE_KEY);
    const decoded = raw === null ? null : decodeMapIndex(raw);
    if (decoded?.kind === "corrupt") return false;
    const stillOwned = new Set(remaining.map(({ originalMapId: id, createdAt }) =>
      mapViewBookmarkKey({ id, createdAt })));
    if (decoded?.kind === "ok") {
      decoded.index.maps.forEach((map) => stillOwned.add(mapViewBookmarkKey(map)));
    }
    let cleaned = true;
    for (const { originalMapId: id, createdAt } of deleted) {
      const key = mapViewBookmarkKey({ id, createdAt });
      if (key !== null && !stillOwned.has(key)) {
        if (!removeMapViewBookmarks(storage, { id, createdAt })) cleaned = false;
        stillOwned.add(key);
      }
    }
    return cleaned;
  } catch {
    return false;
  }
}

export function migrateMapViewBookmarks(
  storage: MapLibraryStorage, { originalMapId: id, createdAt }: TrashIdentity, restoredId: string,
): boolean {
  if (id === restoredId) return true;
  const source = mapViewBookmarkKey({ id, createdAt });
  const destination = mapViewBookmarkKey({ id: restoredId, createdAt });
  if (source === null || destination === null) return true;
  try {
    const value = storage.getItem(source);
    if (value === null) return true;
    if (!decodeBookmarks(value).ok || storage.getItem(destination) !== null) return false;
    storage.setItem(destination, value);
    storage.removeItem(source);
    return true;
  } catch {
    return false;
  }
}
