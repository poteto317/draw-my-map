import { isRecord } from "@/domain/shared/unknownRecord";
import { isValidMapId, type MapIndexEntry } from "./mapIndex";
import { normalizeStoredMapName } from "./mapName";
import {
  normalizeMapTimestamp,
  UNKNOWN_MAP_TIMESTAMP,
} from "./mapTimestamp";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const TRASH_RETENTION_DAYS = 30;
export const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * MS_PER_DAY;

export type MapTrashEntry = {
  id: string;
  originalMapId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string;
  expiresAt: string;
  hasBody: boolean;
};

export type MapTrashIndexV1 = {
  version: 1;
  items: MapTrashEntry[];
};

export type MapTrashState =
  | { status: "ok"; entries: readonly MapTrashEntry[] }
  | { status: "corrupt" };

type MapTrashDecodeResult =
  | { kind: "ok"; index: MapTrashIndexV1; repaired: boolean }
  | { kind: "corrupt" };

function toTime(iso: string): number {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? time : 0;
}

// 削除日時の新しい順 → 元の更新日時の新しい順 → id の昇順。
function compareMapTrashEntriesForDisplay(
  a: MapTrashEntry,
  b: MapTrashEntry,
): number {
  const deleted = toTime(b.deletedAt) - toTime(a.deletedAt);
  if (deleted !== 0) {
    return deleted;
  }
  const updated = toTime(b.updatedAt) - toTime(a.updatedAt);
  if (updated !== 0) {
    return updated;
  }
  if (a.id === b.id) {
    return 0;
  }
  return a.id < b.id ? -1 : 1;
}

function parseValidTime(iso: string): number | null {
  if (iso === UNKNOWN_MAP_TIMESTAMP) {
    return null;
  }
  const time = Date.parse(iso);
  return Number.isFinite(time) ? time : null;
}

// expiresAt が不正、または deletedAt + 保持期間を超える場合は、
// deletedAt が有効なら deletedAt + 保持期間に直す。
function resolveDecodedExpiresAt(
  expiresAt: { value: string; repaired: boolean },
  deletedAtValue: string,
): { value: string; repaired: boolean } {
  const deletedTime = parseValidTime(deletedAtValue);
  if (deletedTime === null) {
    return expiresAt;
  }
  const limitTime = deletedTime + TRASH_RETENTION_MS;
  const expiresTime = parseValidTime(expiresAt.value);
  if (!expiresAt.repaired && expiresTime !== null && expiresTime <= limitTime) {
    return expiresAt;
  }
  const candidate = new Date(limitTime);
  if (Number.isNaN(candidate.getTime())) {
    return expiresAt;
  }
  return { value: candidate.toISOString(), repaired: true };
}

// 1項目を読み込む。使えない項目は null、補正した場合は repaired を立てる。
function decodeTrashEntry(
  value: unknown,
): { entry: MapTrashEntry; repaired: boolean } | null {
  if (!isRecord(value)) {
    return null;
  }
  const { id, originalMapId, name, hasBody } = value;
  if (
    !isValidMapId(id) ||
    !isValidMapId(originalMapId) ||
    typeof name !== "string" ||
    typeof hasBody !== "boolean"
  ) {
    return null;
  }

  const normalizedName = normalizeStoredMapName(name);
  const createdAt = normalizeMapTimestamp(value.createdAt);
  const updatedAt = normalizeMapTimestamp(value.updatedAt);
  const deletedAt = normalizeMapTimestamp(value.deletedAt);
  const expiresAt = resolveDecodedExpiresAt(
    normalizeMapTimestamp(value.expiresAt),
    deletedAt.value,
  );

  return {
    entry: {
      id,
      originalMapId,
      name: normalizedName,
      createdAt: createdAt.value,
      updatedAt: updatedAt.value,
      deletedAt: deletedAt.value,
      expiresAt: expiresAt.value,
      hasBody,
    },
    repaired:
      normalizedName !== name ||
      createdAt.repaired ||
      updatedAt.repaired ||
      deletedAt.repaired ||
      expiresAt.repaired,
  };
}

/**
 * ゴミ箱インデックス JSON を検証・修復しながらデコードする。
 */
export function decodeMapTrashIndex(raw: string): MapTrashDecodeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "corrupt" };
  }
  if (
    !isRecord(parsed) ||
    parsed.version !== 1 ||
    !Array.isArray(parsed.items)
  ) {
    return { kind: "corrupt" };
  }

  let repaired = false;
  const items: MapTrashEntry[] = [];
  const seenIds = new Set<string>();

  for (const item of parsed.items) {
    const decoded = decodeTrashEntry(item);
    if (decoded === null || seenIds.has(decoded.entry.id)) {
      repaired = true;
      continue;
    }
    seenIds.add(decoded.entry.id);
    items.push(decoded.entry);
    repaired = repaired || decoded.repaired;
  }

  return {
    kind: "ok",
    index: { version: 1, items },
    repaired,
  };
}

export function encodeMapTrashIndex(index: MapTrashIndexV1): string {
  return JSON.stringify(index);
}

/**
 * 削除対象のマップスナップショットから 30 日保持のゴミ箱エントリを生成する。
 */
export function createMapTrashEntry(params: {
  id: string;
  entry: MapIndexEntry;
  deletedAt: Date;
  hasBody: boolean;
}): MapTrashEntry {
  const { id, entry, deletedAt, hasBody } = params;
  return {
    id,
    originalMapId: entry.id,
    name: entry.name,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    deletedAt: deletedAt.toISOString(),
    expiresAt: new Date(deletedAt.getTime() + TRASH_RETENTION_MS).toISOString(),
    hasBody,
  };
}

export function isTrashEntryExpired(entry: MapTrashEntry, now: Date): boolean {
  const expiresTime = parseValidTime(entry.expiresAt);
  if (expiresTime === null) {
    return false;
  }
  return expiresTime <= now.getTime();
}

export function partitionExpiredTrashEntries(
  items: readonly MapTrashEntry[],
  now: Date,
): { active: MapTrashEntry[]; expired: MapTrashEntry[] } {
  const active: MapTrashEntry[] = [];
  const expired: MapTrashEntry[] = [];
  for (const item of items) {
    if (isTrashEntryExpired(item, now)) {
      expired.push(item);
    } else {
      active.push(item);
    }
  }
  return { active, expired };
}

export function sortMapTrashEntriesForDisplay(
  items: readonly MapTrashEntry[],
): MapTrashEntry[] {
  return [...items].sort(compareMapTrashEntriesForDisplay);
}

export function calculateTrashRemainingDays(
  entry: MapTrashEntry,
  now: Date,
): number | null {
  const expiresTime = parseValidTime(entry.expiresAt);
  if (expiresTime === null) {
    return null;
  }
  const diffMs = expiresTime - now.getTime();
  if (diffMs <= 0) {
    return 0;
  }
  return Math.min(Math.ceil(diffMs / MS_PER_DAY), TRASH_RETENTION_DAYS);
}

export function formatTrashRemainingDays(
  entry: MapTrashEntry,
  now: Date,
): string {
  const days = calculateTrashRemainingDays(entry, now);
  if (days === null) {
    return "期限不明";
  }
  return days === 0 ? "期限切れ" : `あと ${days} 日`;
}

export function addTrashEntry(
  index: MapTrashIndexV1,
  entry: MapTrashEntry,
): MapTrashIndexV1 {
  return { ...index, items: [...index.items, entry] };
}

export function removeTrashEntry(
  index: MapTrashIndexV1,
  trashId: string,
): MapTrashIndexV1 {
  return {
    ...index,
    items: index.items.filter((item) => item.id !== trashId),
  };
}
