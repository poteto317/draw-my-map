import { isRecord } from "@/domain/shared/unknownRecord";
import { normalizeStoredMapName } from "./mapName";
import { normalizeMapTimestamp } from "./mapTimestamp";

export const MAP_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const DEFAULT_MAX_ID_ATTEMPTS = 10;

export function isValidMapId(value: unknown): value is string {
  return typeof value === "string" && MAP_ID_PATTERN.test(value);
}

export type MapIndexEntry = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type MapIndexV1 = {
  version: 1;
  currentMapId: string;
  maps: MapIndexEntry[];
  legacyCleanupPending: boolean;
};

export type MapIndexDecodeResult =
  { kind: "ok"; index: MapIndexV1; repaired: boolean } | { kind: "corrupt" };

export type MapRemovalPreview = {
  target: MapIndexEntry;
  isCurrent: boolean;
  isLast: boolean;
  nextMap: MapIndexEntry | null;
};

function toTime(iso: string): number {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? time : 0;
}

// 更新日時の新しい順 → 作成日時の新しい順 → id の昇順。
export function compareMapEntriesForDisplay(
  a: MapIndexEntry,
  b: MapIndexEntry,
): number {
  const updated = toTime(b.updatedAt) - toTime(a.updatedAt);
  if (updated !== 0) {
    return updated;
  }
  const created = toTime(b.createdAt) - toTime(a.createdAt);
  if (created !== 0) {
    return created;
  }
  if (a.id === b.id) {
    return 0;
  }
  return a.id < b.id ? -1 : 1;
}

export function sortMapEntriesForDisplay(
  maps: readonly MapIndexEntry[],
): MapIndexEntry[] {
  return [...maps].sort(compareMapEntriesForDisplay);
}

// 削除後に開くマップの規則の唯一の定義。removedId を除いた候補の表示順の先頭。
function pickNextMapAfterRemoval(
  maps: readonly MapIndexEntry[],
  removedId: string,
): MapIndexEntry | null {
  const candidates = maps.filter((map) => map.id !== removedId);
  return sortMapEntriesForDisplay(candidates)[0] ?? null;
}

// 1項目を読み込む。使えない項目は null、補正した場合は repaired を立てる。
function decodeEntry(
  value: unknown,
): { entry: MapIndexEntry; repaired: boolean } | null {
  if (!isRecord(value)) {
    return null;
  }
  const { id, name } = value;
  if (!isValidMapId(id) || typeof name !== "string") {
    return null;
  }
  const normalizedName = normalizeStoredMapName(name);
  const createdAt = normalizeMapTimestamp(value.createdAt);
  const updatedAt = normalizeMapTimestamp(value.updatedAt);
  return {
    entry: {
      id,
      name: normalizedName,
      createdAt: createdAt.value,
      updatedAt: updatedAt.value,
    },
    repaired:
      normalizedName !== name || createdAt.repaired || updatedAt.repaired,
  };
}

export function decodeMapIndex(raw: string): MapIndexDecodeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "corrupt" };
  }
  if (
    !isRecord(parsed) ||
    parsed.version !== 1 ||
    !Array.isArray(parsed.maps)
  ) {
    return { kind: "corrupt" };
  }

  let repaired = false;
  const maps: MapIndexEntry[] = [];
  const seenIds = new Set<string>();
  for (const item of parsed.maps) {
    const decoded = decodeEntry(item);
    if (decoded === null || seenIds.has(decoded.entry.id)) {
      repaired = true;
      continue;
    }
    seenIds.add(decoded.entry.id);
    maps.push(decoded.entry);
    repaired = repaired || decoded.repaired;
  }
  if (maps.length === 0) {
    return { kind: "corrupt" };
  }

  let currentMapId: string;
  if (
    typeof parsed.currentMapId === "string" &&
    seenIds.has(parsed.currentMapId)
  ) {
    currentMapId = parsed.currentMapId;
  } else {
    currentMapId = sortMapEntriesForDisplay(maps)[0].id;
    repaired = true;
  }

  let legacyCleanupPending = false;
  if (typeof parsed.legacyCleanupPending === "boolean") {
    legacyCleanupPending = parsed.legacyCleanupPending;
  } else {
    repaired = true;
  }

  return {
    kind: "ok",
    index: { version: 1, currentMapId, maps, legacyCleanupPending },
    repaired,
  };
}

export function encodeMapIndex(index: MapIndexV1): string {
  return JSON.stringify(index);
}

export function createMapIndexEntry(
  id: string,
  name: string,
  nowIso: string,
): MapIndexEntry {
  return { id, name, createdAt: nowIso, updatedAt: nowIso };
}

export function createSingleMapIndex(
  entry: MapIndexEntry,
  legacyCleanupPending: boolean,
): MapIndexV1 {
  return {
    version: 1,
    currentMapId: entry.id,
    maps: [entry],
    legacyCleanupPending,
  };
}

export function findMapEntry(
  index: MapIndexV1,
  id: string,
): MapIndexEntry | null {
  return index.maps.find((map) => map.id === id) ?? null;
}

export function selectNextMapAfterRemoval(
  index: MapIndexV1,
  removedId: string,
): MapIndexEntry | null {
  return pickNextMapAfterRemoval(index.maps, removedId);
}

export function describeMapRemoval(
  maps: readonly MapIndexEntry[],
  currentMapId: string,
  removedId: string,
): MapRemovalPreview | null {
  const target = maps.find((map) => map.id === removedId);
  if (target === undefined) {
    return null;
  }
  const isCurrent = currentMapId === removedId;
  const isLast = maps.length === 1;
  return {
    target,
    isCurrent,
    isLast,
    nextMap:
      isCurrent && !isLast ? pickNextMapAfterRemoval(maps, removedId) : null,
  };
}

export function addMapEntry(
  index: MapIndexV1,
  entry: MapIndexEntry,
): MapIndexV1 {
  return { ...index, currentMapId: entry.id, maps: [...index.maps, entry] };
}

export function setCurrentMap(
  index: MapIndexV1,
  id: string,
): MapIndexV1 | null {
  if (findMapEntry(index, id) === null) {
    return null;
  }
  return { ...index, currentMapId: id };
}

function updateMapEntry(
  index: MapIndexV1,
  id: string,
  update: (entry: MapIndexEntry) => MapIndexEntry,
): MapIndexV1 | null {
  if (findMapEntry(index, id) === null) {
    return null;
  }
  return {
    ...index,
    maps: index.maps.map((map) => (map.id === id ? update(map) : map)),
  };
}

export function renameMapEntry(
  index: MapIndexV1,
  id: string,
  name: string,
): MapIndexV1 | null {
  return updateMapEntry(index, id, (map) => ({ ...map, name }));
}

export function touchMapEntry(
  index: MapIndexV1,
  id: string,
  updatedAt: string,
): MapIndexV1 | null {
  return updateMapEntry(index, id, (map) => ({ ...map, updatedAt }));
}

export function removeMapEntry(
  index: MapIndexV1,
  removedId: string,
): MapIndexV1 | null {
  if (findMapEntry(index, removedId) === null) {
    return null;
  }
  const maps = index.maps.filter((map) => map.id !== removedId);
  if (maps.length === 0) {
    return null;
  }
  if (index.currentMapId !== removedId) {
    return { ...index, maps };
  }
  const next = pickNextMapAfterRemoval(index.maps, removedId);
  if (next === null) {
    return null;
  }
  return { ...index, maps, currentMapId: next.id };
}

export function replaceLastMapEntry(
  index: MapIndexV1,
  removedId: string,
  replacement: MapIndexEntry,
): MapIndexV1 | null {
  if (index.maps.length !== 1 || index.maps[0].id !== removedId) {
    return null;
  }
  return {
    ...index,
    currentMapId: replacement.id,
    maps: [replacement],
  };
}

export function withLegacyCleanupPending(
  index: MapIndexV1,
  pending: boolean,
): MapIndexV1 {
  return { ...index, legacyCleanupPending: pending };
}

// 使われていない id を返す。作れなければ null。正規表現に合わない id も作り直す。
export function pickUnusedMapId(
  generateId: () => string,
  isUsed: (id: string) => boolean,
  maxAttempts: number = DEFAULT_MAX_ID_ATTEMPTS,
): string | null {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const id = generateId();
    if (isValidMapId(id) && !isUsed(id)) {
      return id;
    }
  }
  return null;
}
