import { decodeMapIndex, isValidMapId, type MapIndexV1 } from "@/domain/mapLibrary/mapIndex";
import { parseMapDocumentJsonWithVersion } from "@/domain/persistence/mapDocumentDecoder";
import { isRecord } from "@/domain/shared/unknownRecord";

export const LIBRARY_RESTORE_JOURNAL_KEY = "draw-my-map.library-restore.v1";

export type LibraryRestoreJournal = {
  format: "draw-my-map-library-restore";
  version: 1;
  indexBefore: string;
  indexAfter: string;
  bodies: { id: string; json: string }[];
};

export function encodeLibraryRestoreJournal(journal: LibraryRestoreJournal): string {
  return JSON.stringify(journal);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function decodeStrictIndex(raw: string): MapIndexV1 | null {
  const decoded = decodeMapIndex(raw);
  if (decoded.kind !== "ok" || decoded.repaired) return null;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) ||
    !hasOnlyKeys(value, ["version", "currentMapId", "maps", "legacyCleanupPending"]) ||
    !Array.isArray(value.maps) ||
    value.maps.some((entry: unknown) => !isRecord(entry) ||
      !hasOnlyKeys(entry, ["id", "name", "createdAt", "updatedAt"]))) {
    return null;
  }
  return decoded.index;
}

export function decodeLibraryRestoreJournal(raw: string): LibraryRestoreJournal | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.format !== "draw-my-map-library-restore" ||
    value.version !== 1 || typeof value.indexBefore !== "string" ||
    typeof value.indexAfter !== "string" || !Array.isArray(value.bodies) ||
    value.bodies.length === 0) return null;

  const before = decodeStrictIndex(value.indexBefore);
  const after = decodeStrictIndex(value.indexAfter);
  if (before === null || after === null ||
    before.currentMapId !== after.currentMapId ||
    before.legacyCleanupPending !== after.legacyCleanupPending ||
    after.maps.length !== before.maps.length + value.bodies.length ||
    before.maps.some((entry, index) => {
      const next = after.maps[index];
      return next.id !== entry.id || next.name !== entry.name ||
        next.createdAt !== entry.createdAt || next.updatedAt !== entry.updatedAt;
    })) return null;

  const oldIds = new Set(before.maps.map((entry) => entry.id));
  const newIds = new Set(after.maps.slice(before.maps.length).map((entry) => entry.id));
  const bodyIds = new Set<string>();
  const bodies: LibraryRestoreJournal["bodies"] = [];
  for (const item of value.bodies) {
    if (!isRecord(item) || !isValidMapId(item.id) ||
      oldIds.has(item.id) || bodyIds.has(item.id) || !newIds.has(item.id) ||
      typeof item.json !== "string") return null;
    const parsed = parseMapDocumentJsonWithVersion(item.json);
    if (!parsed.ok || parsed.value.sourceVersion !== 3) return null;
    bodyIds.add(item.id);
    bodies.push({ id: item.id, json: item.json });
  }
  if (bodyIds.size !== newIds.size) return null;
  return {
    format: "draw-my-map-library-restore",
    version: 1,
    indexBefore: value.indexBefore,
    indexAfter: value.indexAfter,
    bodies,
  };
}
