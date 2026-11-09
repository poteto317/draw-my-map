import { decodeLibraryBackup, type LibraryBackupV1 } from "@/domain/mapLibrary/libraryBackupCodec";
import { decodeMapIndex, encodeMapIndex, pickUnusedMapId, type MapIndexV1 } from "@/domain/mapLibrary/mapIndex";
import type { MapDocumentResult } from "@/types/mapDocument";
import { BRANCH_MOVE_JOURNAL_KEY } from "./branchMoveJournal";
import { decodeLibraryRestoreJournal, encodeLibraryRestoreJournal,
  LIBRARY_RESTORE_JOURNAL_KEY, type LibraryRestoreJournal } from "./libraryRestoreJournal";
import { isQuotaExceededError, MAP_INDEX_STORAGE_KEY, mapBodyKey, type MapLibraryStorage } from "./mapLibraryStorage";
import { parseMapDocumentJsonWithVersion } from "@/domain/persistence/mapDocumentCodec";
import { DEFAULT_MAP_NAME } from "@/domain/mapLibrary/mapName";

export type RestoreWritePlan = {
  indexBeforeRaw: string;
  indexAfter: MapIndexV1;
  journal: LibraryRestoreJournal;
};

export type RestoreWriteResult =
  | { status: "saved" }
  | { status: "failed" | "recoveryRequired"; error: string };

export type BlockedLibraryRestoreRecovery = {
  kind: "blocked";
  initialJson: string | null;
  mapId: string;
  mapName: string;
  error: string;
};
export type LibraryRestoreRecovery =
  | { kind: "none" | "recovered" | "unavailable" }
  | BlockedLibraryRestoreRecovery;

const CHANGED = "マップ一覧または保存データが変わりました。確認し直してください。";
const UNAVAILABLE = "保存データを読み取れませんでした。確認してやり直してください。";
const NO_ID = "新しいマップIDを確保できませんでした。やり直してください。";
const WRITE_ERROR = "バックアップを復元できませんでした。保存データを確認してやり直してください。";
const QUOTA_ERROR = "保存領域の空きが足りず、バックアップを復元できませんでした。不要なデータを減らしてやり直してください。";
const RECOVERY_ERROR = "復元前の保存データへ戻せませんでした。この画面での変更は保存されません。ページを閉じる前にJSONで書き出してください。";
const RECOVERY_JOURNAL_ERROR = `ライブラリ復元の記録を安全に戻せませんでした。この画面での変更は保存されません。現在のマップをJSONで書き出してください。ブラウザの localStorage のキー「${LIBRARY_RESTORE_JOURNAL_KEY}」を残しています。`;

function failure(error: string): MapDocumentResult<never> {
  return { ok: false, error };
}

function validBefore(raw: string, index: MapIndexV1): boolean {
  const decoded = decodeMapIndex(raw);
  return decoded.kind === "ok" && !decoded.repaired &&
    encodeMapIndex(decoded.index) === encodeMapIndex(index);
}

function prerequisitesUnchanged(storage: MapLibraryStorage, plan: RestoreWritePlan): boolean {
  return storage.getItem(MAP_INDEX_STORAGE_KEY) === plan.indexBeforeRaw &&
    storage.getItem(LIBRARY_RESTORE_JOURNAL_KEY) === null &&
    storage.getItem(BRANCH_MOVE_JOURNAL_KEY) === null &&
    plan.journal.bodies.every(body => storage.getItem(mapBodyKey(body.id)) === null);
}

export function planLibraryRestore(
  storage: MapLibraryStorage,
  index: MapIndexV1,
  indexBeforeRaw: string,
  backup: LibraryBackupV1,
  generateId: () => string,
): MapDocumentResult<RestoreWritePlan> {
  if (!validBefore(indexBeforeRaw, index)) return failure(CHANGED);
  const decoded = decodeLibraryBackup(backup);
  if (!decoded.ok) return decoded;
  try {
    if (storage.getItem(MAP_INDEX_STORAGE_KEY) !== indexBeforeRaw ||
      storage.getItem(LIBRARY_RESTORE_JOURNAL_KEY) !== null ||
      storage.getItem(BRANCH_MOVE_JOURNAL_KEY) !== null) return failure(CHANGED);

    const used = new Set(index.maps.map(map => map.id));
    const additions: MapIndexV1["maps"] = [];
    const bodies: LibraryRestoreJournal["bodies"] = [];
    for (const map of decoded.value.maps) {
      const id = pickUnusedMapId(generateId, candidate =>
        used.has(candidate) || storage.getItem(mapBodyKey(candidate)) !== null);
      if (id === null) return failure(NO_ID);
      used.add(id);
      additions.push({ id, name: map.name, createdAt: map.createdAt, updatedAt: map.updatedAt });
      bodies.push({ id, json: JSON.stringify(map.document) });
    }
    const indexAfter: MapIndexV1 = { ...index, maps: [...index.maps, ...additions] };
    const journal: LibraryRestoreJournal = {
      format: "draw-my-map-library-restore", version: 1,
      indexBefore: indexBeforeRaw, indexAfter: encodeMapIndex(indexAfter), bodies,
    };
    if (decodeLibraryRestoreJournal(encodeLibraryRestoreJournal(journal)) === null) return failure(CHANGED);
    // ID を選んでいる間の変化も書込前に検知する。
    if (!prerequisitesUnchanged(storage, { indexBeforeRaw, indexAfter, journal })) return failure(CHANGED);
    return { ok: true, value: { indexBeforeRaw, indexAfter, journal } };
  } catch {
    return failure(UNAVAILABLE);
  }
}

function writeError(error: unknown): string {
  return isQuotaExceededError(error) ? QUOTA_ERROR : WRITE_ERROR;
}

function rollback(
  storage: MapLibraryStorage,
  plan: RestoreWritePlan,
  writtenBodies: string[],
  indexWritten: boolean,
): boolean {
  let restored = true;
  if (indexWritten) {
    try {
      storage.setItem(MAP_INDEX_STORAGE_KEY, plan.indexBeforeRaw);
    } catch {
      restored = false;
    }
  }
  for (let i = writtenBodies.length - 1; i >= 0; i -= 1) {
    try {
      storage.removeItem(mapBodyKey(writtenBodies[i]));
    } catch {
      restored = false;
    }
  }
  if (!restored) return false;
  try {
    storage.removeItem(LIBRARY_RESTORE_JOURNAL_KEY);
    return true;
  } catch {
    return false;
  }
}

export function writeLibraryRestore(storage: MapLibraryStorage, plan: RestoreWritePlan): RestoreWriteResult {
  const raw = encodeLibraryRestoreJournal(plan.journal);
  const validated = decodeLibraryRestoreJournal(raw);
  if (validated === null || plan.indexBeforeRaw !== validated.indexBefore ||
    encodeMapIndex(plan.indexAfter) !== validated.indexAfter) {
    return { status: "failed", error: WRITE_ERROR };
  }
  try {
    if (!prerequisitesUnchanged(storage, plan)) return { status: "failed", error: CHANGED };
  } catch {
    return { status: "failed", error: UNAVAILABLE };
  }
  try {
    storage.setItem(LIBRARY_RESTORE_JOURNAL_KEY, raw);
  } catch (error) {
    return { status: "failed", error: writeError(error) };
  }
  const writtenBodies: string[] = [];
  let indexWritten = false;
  try {
    for (const body of validated.bodies) {
      storage.setItem(mapBodyKey(body.id), body.json);
      writtenBodies.push(body.id);
    }
    storage.setItem(MAP_INDEX_STORAGE_KEY, validated.indexAfter);
    indexWritten = true;
    storage.removeItem(LIBRARY_RESTORE_JOURNAL_KEY);
    return { status: "saved" };
  } catch (error) {
    const restored = rollback(storage, plan, writtenBodies, indexWritten);
    return restored
      ? { status: "failed", error: writeError(error) }
      : { status: "recoveryRequired", error: RECOVERY_ERROR };
  }
}

function blockedRecovery(storage: MapLibraryStorage, journal: LibraryRestoreJournal | null,
  extraKey?: string): BlockedLibraryRestoreRecovery {
  let mapId = "library-restore-recovery";
  let mapName = DEFAULT_MAP_NAME;
  let initialJson: string | null = null;
  let currentIndex: MapIndexV1 | null = null;
  try {
    const rawIndex = storage.getItem(MAP_INDEX_STORAGE_KEY);
    const decoded = rawIndex === null ? null : decodeMapIndex(rawIndex);
    if (decoded?.kind === "ok" && !decoded.repaired) currentIndex = decoded.index;
  } catch {
    // 保存中一覧の読取不能時は有効な journal の旧一覧を救出の手掛かりにする。
  }
  const fallback = journal === null ? null : decodeMapIndex(journal.indexBefore);
  const beforeIndex = fallback?.kind === "ok" && !fallback.repaired ? fallback.index : null;
  const index = currentIndex ?? beforeIndex;
  if (index !== null) {
    mapId = index.currentMapId;
    mapName = index.maps.find(map => map.id === mapId)?.name ?? DEFAULT_MAP_NAME;
    try {
      const body = storage.getItem(mapBodyKey(mapId));
      if (body !== null) {
        const parsed = parseMapDocumentJsonWithVersion(body);
        if (parsed.ok) initialJson = body;
      }
    } catch {
      // 選んだ現在本体の読取不能時は、別マップの本体で代用しない。
    }
  }
  return { kind: "blocked", initialJson, mapId, mapName,
    error: RECOVERY_JOURNAL_ERROR + (extraKey ? ` キー「${extraKey}」も残っています。` : "") };
}

export function recoverLibraryRestore(storage: MapLibraryStorage): LibraryRestoreRecovery {
  let raw: string | null;
  let branchRaw: string | null;
  try {
    raw = storage.getItem(LIBRARY_RESTORE_JOURNAL_KEY);
    branchRaw = storage.getItem(BRANCH_MOVE_JOURNAL_KEY);
  } catch {
    return { kind: "unavailable" };
  }
  if (raw === null) return { kind: "none" };
  const journal = decodeLibraryRestoreJournal(raw);
  if (branchRaw !== null || journal === null) {
    return blockedRecovery(storage, journal, branchRaw === null ? undefined : BRANCH_MOVE_JOURNAL_KEY);
  }
  try {
    const indexRaw = storage.getItem(MAP_INDEX_STORAGE_KEY);
    if (indexRaw !== journal.indexBefore && indexRaw !== journal.indexAfter) return blockedRecovery(storage, journal);
    for (const body of journal.bodies) {
      const actual = storage.getItem(mapBodyKey(body.id));
      if (actual !== null && actual !== body.json) return blockedRecovery(storage, journal);
    }
  } catch {
    return { kind: "unavailable" };
  }

  let restored = true;
  try {
    storage.setItem(MAP_INDEX_STORAGE_KEY, journal.indexBefore);
  } catch {
    restored = false;
  }
  for (let i = journal.bodies.length - 1; i >= 0; i -= 1) {
    try {
      storage.removeItem(mapBodyKey(journal.bodies[i].id));
    } catch {
      restored = false;
    }
  }
  if (!restored) return blockedRecovery(storage, journal);
  try {
    storage.removeItem(LIBRARY_RESTORE_JOURNAL_KEY);
    return { kind: "recovered" };
  } catch {
    return blockedRecovery(storage, journal);
  }
}
