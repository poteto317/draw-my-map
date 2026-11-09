import { createLibraryBackup, MAX_LIBRARY_BACKUP_MAPS, type LibraryBackupMap } from "@/domain/mapLibrary/libraryBackupCodec";
import { decodeMapIndex, encodeMapIndex, type MapIndexV1 } from "@/domain/mapLibrary/mapIndex";
import { parseMapDocumentJson } from "@/domain/persistence/mapDocumentDecoder";
import { isEligibleMapBackupSnapshot } from "@/domain/persistence/mapBackupSnapshot";
import type { MapDocumentResult, MapDocumentV3 } from "@/types/mapDocument";
import type { MapStorageSession } from "@/types/mapStorageSession";
import { BRANCH_MOVE_JOURNAL_KEY } from "./branchMoveJournal";
import { LIBRARY_RESTORE_JOURNAL_KEY } from "./libraryRestoreJournal";
import { MAP_BODY_KEY_PREFIX, MAP_INDEX_STORAGE_KEY, readMapBody, type MapLibraryStorage } from "./mapLibraryStorage";

const RETRY = "マップ一覧を開き直して、バックアップを再試行してください。";
const CURRENT_RETRY = "現在のマップを開き直して、バックアップを再試行してください。";
const EMPTY_DOCUMENT: MapDocumentV3 = { version: 3, layoutMode: "manual", nodes: [] };

export type LibraryBackupPreview = {
  json: string;
  currentSnapshotJson: string;
  fileNameDate: Date;
  missingBodyNames: string[];
  orphanBodyCount: number;
  indexRaw: string;
  session: MapStorageSession;
};

function failure(error: string): MapDocumentResult<never> {
  return { ok: false, error };
}

function readStableIndex(storage: MapLibraryStorage, index: MapIndexV1): string | null {
  const raw = storage.getItem(MAP_INDEX_STORAGE_KEY);
  if (raw === null) return null;
  const decoded = decodeMapIndex(raw);
  if (decoded.kind !== "ok" || decoded.repaired ||
    encodeMapIndex(decoded.index) !== encodeMapIndex(index)) return null;
  return raw;
}

function hasJournal(storage: MapLibraryStorage): boolean {
  return storage.getItem(BRANCH_MOVE_JOURNAL_KEY) !== null ||
    storage.getItem(LIBRARY_RESTORE_JOURNAL_KEY) !== null;
}

function countOrphanBodies(storage: MapLibraryStorage, index: MapIndexV1): number {
  const registered = new Set(index.maps.map((map) => map.id));
  let count = 0;
  for (let position = 0; position < storage.length; position += 1) {
    const key = storage.key(position);
    if (key !== null && key.startsWith(MAP_BODY_KEY_PREFIX) &&
      !registered.has(key.slice(MAP_BODY_KEY_PREFIX.length))) count += 1;
  }
  return count;
}

export function prepareLibraryBackup(
  storage: MapLibraryStorage,
  index: MapIndexV1,
  session: MapStorageSession,
  now: Date,
): MapDocumentResult<LibraryBackupPreview> {
  try {
    const indexRaw = readStableIndex(storage, index);
    if (indexRaw === null) return failure(RETRY);
    if (hasJournal(storage)) return failure(`処理中の保存記録があります。${RETRY}`);
    if (session.mapId !== index.currentMapId) return failure(CURRENT_RETRY);
    const snapshot = session.readBackupSnapshot();
    if (!isEligibleMapBackupSnapshot(snapshot)) return failure(CURRENT_RETRY);
    const currentDocument = parseMapDocumentJson(snapshot.json);
    if (!currentDocument.ok) return failure(CURRENT_RETRY);
    if (index.maps.length > MAX_LIBRARY_BACKUP_MAPS) {
      return failure("バックアップできるマップは1000件までです。大きいライブラリは個別のJSON書き出しで保存できます。");
    }

    const maps: LibraryBackupMap[] = [];
    const missingBodyNames: string[] = [];
    for (const entry of index.maps) {
      let document: MapDocumentV3;
      if (entry.id === index.currentMapId) {
        document = currentDocument.value;
      } else {
        const body = readMapBody(storage, entry.id);
        if (!body.ok) return failure(`「${entry.name}」を読み取れませんでした。${RETRY}`);
        if (body.value === null) {
          missingBodyNames.push(entry.name);
          document = EMPTY_DOCUMENT;
        } else {
          const parsed = parseMapDocumentJson(body.value);
          if (!parsed.ok) return failure(`「${entry.name}」の保存データが不正です。${RETRY}`);
          document = parsed.value;
        }
      }
      maps.push({ ...entry, document });
    }

    const orphanBodyCount = countOrphanBodies(storage, index);
    const created = createLibraryBackup(maps, index.currentMapId, now.toISOString());
    if (!created.ok) return failure(created.error);
    if (readStableIndex(storage, index) !== indexRaw || hasJournal(storage)) return failure(RETRY);
    const latest = session.readBackupSnapshot();
    if (!isEligibleMapBackupSnapshot(latest) || latest.json !== snapshot.json) return failure(RETRY);

    return { ok: true, value: {
      json: created.value.json,
      currentSnapshotJson: snapshot.json,
      fileNameDate: now,
      missingBodyNames,
      orphanBodyCount,
      indexRaw,
      session,
    } };
  } catch {
    return failure(RETRY);
  }
}

export function isLibraryBackupPreviewCurrent(
  storage: MapLibraryStorage,
  index: MapIndexV1,
  session: MapStorageSession,
  preview: LibraryBackupPreview,
): boolean {
  try {
    if (session !== preview.session || session.mapId !== index.currentMapId ||
      readStableIndex(storage, index) !== preview.indexRaw || hasJournal(storage)) return false;
    const snapshot = session.readBackupSnapshot();
    return isEligibleMapBackupSnapshot(snapshot) && snapshot.json === preview.currentSnapshotJson &&
      parseMapDocumentJson(snapshot.json).ok;
  } catch {
    return false;
  }
}
