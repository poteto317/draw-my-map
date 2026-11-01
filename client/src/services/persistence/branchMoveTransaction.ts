import { decodeMapIndex } from "@/domain/mapLibrary/mapIndex";
import { DEFAULT_MAP_NAME } from "@/domain/mapLibrary/mapName";
import { BRANCH_MOVE_JOURNAL_KEY, decodeBranchMoveJournal, encodeBranchMoveJournal, type BranchMoveJournal } from "./branchMoveJournal";
import { isQuotaExceededError, MAP_INDEX_STORAGE_KEY, mapBodyKey, type MapLibraryStorage } from "./mapLibraryStorage";

export type BranchMoveWriteInput = Omit<BranchMoveJournal, "version"> & {
  sourceAfter: string;
  targetAfter: string;
  indexAfter: string;
};
type WriteResult = {
  ok: true;
} | {
  ok: false;
  error: string;
  recoveryRequired: boolean;
};
export type BlockedBranchMoveRecovery = {
  kind: "blocked";
  initialJson: string | null;
  mapId: string;
  mapName: string;
  error: string;
};
type RecoveryResult = {
  kind: "none" | "recovered" | "unavailable";
} | BlockedBranchMoveRecovery;
const WRITE_ERROR = "枝を移動できませんでした。保存データを確認してやり直してください。";
const RECOVERY_ERROR = "枝の移動前の保存データを復元できませんでした。この画面での変更は保存されません。ページを閉じる前にJSONで書き出してください。";
// 必要な空きは枝や両方の本体の大きさで変わるので、固定の倍率は示さない（data-model.md の 5.11 節）
const QUOTA_ERROR = "保存領域の空きが足りないため、枝を移動できませんでした。移動の間は両方のマップの写しと移す枝の分の空きが一時的に必要です。不要なマップやイラストを減らしてやり直してください。";
const BROKEN_JOURNAL_ERROR = `枝の移動の記録が壊れているため、保存データを守って開きました。この画面での変更は保存されません。移動前のデータはブラウザの localStorage のキー「${BRANCH_MOVE_JOURNAL_KEY}」に残っています。`;
type OriginalEntry = {
  key: string;
  value: string | null;
};

type PlannedWrite = OriginalEntry & { after: string };

function originals(journal: BranchMoveJournal): OriginalEntry[] {
  return [
    { key: mapBodyKey(journal.targetId), value: journal.targetBefore },
    { key: mapBodyKey(journal.sourceId), value: journal.sourceBefore },
    { key: MAP_INDEX_STORAGE_KEY, value: journal.indexBefore },
  ];
}

function writeFailureMessage(error: unknown): string {
  return isQuotaExceededError(error) ? QUOTA_ERROR : WRITE_ERROR;
}

// 容量を空けるため移動先から戻す。1つ失敗しても残りの原本を復元する。
function restore(storage: MapLibraryStorage, entries: OriginalEntry[]): boolean {
  let restored = true;
  for (const { key, value } of entries) {
    try {
      if (value === null) {
        storage.removeItem(key);
      } else {
        storage.setItem(key, value);
      }
    } catch {
      restored = false;
    }
  }
  if (!restored) {
    return false;
  }
  try {
    storage.removeItem(BRANCH_MOVE_JOURNAL_KEY);
    return true;
  } catch {
    return false;
  }
}

// 書く順に並べる。失敗時は書き終えた分を同じ順で戻す
function planWrites(journal: BranchMoveJournal, input: BranchMoveWriteInput): PlannedWrite[] {
  const [target, source, index] = originals(journal);
  return [
    { ...target, after: input.targetAfter },
    { ...source, after: input.sourceAfter },
    { ...index, after: input.indexAfter },
  ];
}

// ジャーナルが残っていれば復旧が要る。読み取りの失敗はまだ何も書いていないので、やり直せる失敗にする
function checkWritable(storage: MapLibraryStorage, journal: BranchMoveJournal): WriteResult {
  try {
    if (storage.getItem(BRANCH_MOVE_JOURNAL_KEY) !== null) {
      return { ok: false, error: RECOVERY_ERROR, recoveryRequired: true };
    }
    if (originals(journal).some(({ key, value }) => storage.getItem(key) !== value)) {
      return { ok: false, error: WRITE_ERROR, recoveryRequired: false };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: WRITE_ERROR, recoveryRequired: false };
  }
}

// ジャーナルを置いた後の書き込み。ジャーナルの削除が確定点で、それ以前の失敗は原本へ戻す
function applyWrites(storage: MapLibraryStorage, writes: PlannedWrite[]): WriteResult {
  const written: OriginalEntry[] = [];
  try {
    for (const entry of writes) {
      storage.setItem(entry.key, entry.after);
      written.push(entry);
    }
    storage.removeItem(BRANCH_MOVE_JOURNAL_KEY);
    return { ok: true };
  } catch (error) {
    const recoveryRequired = !restore(storage, written);
    return { ok: false, error: recoveryRequired ? RECOVERY_ERROR : writeFailureMessage(error), recoveryRequired };
  }
}

export function writeBranchMove(storage: MapLibraryStorage, input: BranchMoveWriteInput): WriteResult {
  const journal: BranchMoveJournal = { version: 1, sourceId: input.sourceId, targetId: input.targetId,
    sourceBefore: input.sourceBefore, targetBefore: input.targetBefore, indexBefore: input.indexBefore };
  const raw = encodeBranchMoveJournal(journal);
  if (decodeBranchMoveJournal(raw) === null) {
    return { ok: false, error: WRITE_ERROR, recoveryRequired: false };
  }
  const writable = checkWritable(storage, journal);
  if (!writable.ok) return writable;
  try {
    storage.setItem(BRANCH_MOVE_JOURNAL_KEY, raw);
  } catch (error) {
    return { ok: false, error: writeFailureMessage(error), recoveryRequired: false };
  }
  return applyWrites(storage, planWrites(journal, input));
}

function readJournalMapName(journal: BranchMoveJournal): string {
  const decoded = decodeMapIndex(journal.indexBefore);
  if (decoded.kind !== "ok") return DEFAULT_MAP_NAME;
  return decoded.index.maps.find(map => map.id === journal.sourceId)?.name ?? DEFAULT_MAP_NAME;
}

function blocked(journal: BranchMoveJournal | null): BlockedBranchMoveRecovery {
  return { kind: "blocked", initialJson: journal?.sourceBefore ?? null,
    mapId: journal?.sourceId ?? "branch-move-recovery",
    mapName: journal === null ? DEFAULT_MAP_NAME : readJournalMapName(journal),
    error: journal === null ? BROKEN_JOURNAL_ERROR : RECOVERY_ERROR };
}

export function recoverBranchMove(storage: MapLibraryStorage): RecoveryResult {
  let raw: string | null;
  try {
    raw = storage.getItem(BRANCH_MOVE_JOURNAL_KEY);
  } catch {
    return { kind: "unavailable" };
  }
  if (raw === null) {
    return { kind: "none" };
  }
  const journal = decodeBranchMoveJournal(raw);
  if (journal === null) {
    return blocked(null);
  }
  return restore(storage, originals(journal)) ? { kind: "recovered" } : blocked(journal);
}
