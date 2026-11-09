import { isValidMapId, type MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
import { normalizeStoredMapName } from "@/domain/mapLibrary/mapName";
import { normalizeMapTimestamp } from "@/domain/mapLibrary/mapTimestamp";
import { parseMapDocumentJsonWithVersion } from "@/domain/persistence/mapDocumentDecoder";
import { isRecord } from "@/domain/shared/unknownRecord";
import type { MapDocumentResult, MapDocumentV3 } from "@/types/mapDocument";

export const MAX_LIBRARY_BACKUP_BYTES = 32 * 1024 * 1024;
export const MAX_LIBRARY_BACKUP_MAPS = 1000;

const FORMAT = "draw-my-map-library-backup";
const TOO_LARGE = "バックアップは32 MiB以下にしてください。大きいマップは個別のJSON書き出しで保存できます。";

export type LibraryBackupMap = MapIndexEntry & { document: MapDocumentV3 };

export type LibraryBackupV1 = {
  format: typeof FORMAT;
  version: 1;
  exportedAt: string;
  currentMapId: string;
  maps: LibraryBackupMap[];
};

function failure(error: string): MapDocumentResult<never> {
  return { ok: false, error };
}

function validTimestamp(value: unknown): value is string {
  return normalizeMapTimestamp(value).repaired === false;
}

function decodeMap(value: unknown): MapDocumentResult<LibraryBackupMap> {
  if (!isRecord(value) || !isValidMapId(value.id) ||
    typeof value.name !== "string" || normalizeStoredMapName(value.name) !== value.name ||
    !validTimestamp(value.createdAt) || !validTimestamp(value.updatedAt)) {
    return failure("バックアップ内のマップ情報が不正です。");
  }

  let documentJson: string | undefined;
  try {
    documentJson = JSON.stringify(value.document);
  } catch {
    return failure("バックアップ内のマップデータが不正です。");
  }
  if (documentJson === undefined) {
    return failure("バックアップ内のマップデータが不正です。");
  }
  const parsed = parseMapDocumentJsonWithVersion(documentJson);
  if (!parsed.ok || parsed.value.sourceVersion !== 3) {
    return failure("バックアップ内のマップデータは有効なV3形式である必要があります。");
  }

  return {
    ok: true,
    value: {
      id: value.id,
      name: value.name,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      document: parsed.value.document,
    },
  };
}

export function decodeLibraryBackup(value: unknown): MapDocumentResult<LibraryBackupV1> {
  if (!isRecord(value) || value.format !== FORMAT || value.version !== 1 ||
    !validTimestamp(value.exportedAt) || !isValidMapId(value.currentMapId) ||
    !Array.isArray(value.maps)) {
    return failure("バックアップファイルの形式が不正か、未対応の版です。");
  }
  if (value.maps.length === 0 || value.maps.length > MAX_LIBRARY_BACKUP_MAPS) {
    return failure("バックアップのマップ数は1件以上1000件以下である必要があります。");
  }

  const maps: LibraryBackupMap[] = [];
  const seenIds = new Set<string>();
  for (const candidate of value.maps) {
    const decoded = decodeMap(candidate);
    if (!decoded.ok) return decoded;
    if (seenIds.has(decoded.value.id)) {
      return failure("バックアップ内のマップIDが重複しています。");
    }
    seenIds.add(decoded.value.id);
    maps.push(decoded.value);
  }
  if (!seenIds.has(value.currentMapId)) {
    return failure("現在のマップIDがバックアップ内にありません。");
  }

  return {
    ok: true,
    value: {
      format: FORMAT,
      version: 1,
      exportedAt: value.exportedAt,
      currentMapId: value.currentMapId,
      maps,
    },
  };
}

export function parseLibraryBackupJson(raw: string): MapDocumentResult<LibraryBackupV1> {
  if (new Blob([raw]).size > MAX_LIBRARY_BACKUP_BYTES) return failure(TOO_LARGE);
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return failure("バックアップのJSONを解析できませんでした。");
  }
  return decodeLibraryBackup(value);
}

export function createLibraryBackup(
  maps: readonly LibraryBackupMap[],
  currentMapId: string,
  exportedAt: string,
): MapDocumentResult<{ backup: LibraryBackupV1; json: string; byteSize: number }> {
  const decoded = decodeLibraryBackup({ format: FORMAT, version: 1, exportedAt, currentMapId, maps });
  if (!decoded.ok) return decoded;
  const json = JSON.stringify(decoded.value);
  const byteSize = new Blob([json]).size;
  if (byteSize > MAX_LIBRARY_BACKUP_BYTES) return failure(TOO_LARGE);
  return { ok: true, value: { backup: decoded.value, json, byteSize } };
}
