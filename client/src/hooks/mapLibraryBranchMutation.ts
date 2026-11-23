import type { MapIndexV1 } from "@/domain/mapLibrary/mapIndex";
import {
  failedOperation,
  isActiveBranchMoveSource,
  type LibraryState,
  type MapLibraryOperationResult,
  type PersistentLibraryState,
} from "@/hooks/mapLibraryState";
import { readBranchMoveIndex } from "@/services/persistence/mapBranchTransfer";
import type { MapLibraryStorage } from "@/services/persistence/mapLibraryStorage";
import type { MapFlushResult } from "@/types/mapStorageSession";
import type { MapStorageSession } from "@/types/mapStorageSession";
import type { OperationNotice } from "@/types/operationNotice";

export type BranchMutationFlushNotices = {
  readonly conflict: OperationNotice;
  readonly failed: OperationNotice;
  readonly rejected: OperationNotice;
};

export type BranchMutationStoredIndex = {
  readonly index: MapIndexV1;
  readonly raw: string;
};

export type ReadBranchMutationStoredIndex = (
  storage: MapLibraryStorage,
) => BranchMutationStoredIndex | null;

export type PreparedBranchMutation = {
  readonly current: PersistentLibraryState;
  readonly stored: BranchMutationStoredIndex;
};

export type PrepareBranchMutationInput = {
  readonly before: PersistentLibraryState;
  readonly current: LibraryState | null;
  readonly sourceSession: MapStorageSession;
  readonly flush: MapFlushResult;
  readonly notices: BranchMutationFlushNotices;
  readonly validateBeforeFlush?: (
    before: PersistentLibraryState,
  ) => MapLibraryOperationResult | null;
  /** テストや差し替え用。未指定時はストレージからインデックスを読む。 */
  readonly readStoredIndex?: ReadBranchMutationStoredIndex;
};

// flush 完了後に、読み直したインデックスが移動元マップを指しているかだけを検証する（I/O なし）。
export function resolveBranchMutationStoredIndex(
  stored: BranchMutationStoredIndex | null,
  sourceMapId: string,
  rejected: OperationNotice,
): MapLibraryOperationResult | BranchMutationStoredIndex {
  if (stored === null || stored.index.currentMapId !== sourceMapId) {
    return failedOperation(rejected);
  }
  return stored;
}

// flush 前: セッション・flush 結果・任意の事前条件。失敗時だけ結果を返し、通過時は null。
export function rejectBranchMutationBeforeFlush(
  input: Pick<
    PrepareBranchMutationInput,
    "before" | "sourceSession" | "flush" | "notices" | "validateBeforeFlush"
  >,
): MapLibraryOperationResult | null {
  const { before, sourceSession, flush, notices, validateBeforeFlush } = input;

  if (!isActiveBranchMoveSource(before, sourceSession)) {
    return failedOperation(notices.rejected);
  }
  const preFlushFailure = validateBeforeFlush?.(before);
  if (preFlushFailure !== undefined && preFlushFailure !== null) {
    return preFlushFailure;
  }
  if (flush.status === "conflict") {
    return failedOperation(notices.conflict);
  }
  if (flush.status === "failed") {
    return failedOperation(notices.failed);
  }
  return null;
}

// flush 後: セッションがまだ有効かとストレージ上インデックスの一致を検証する。読み取りは readStoredIndex に委譲する。
export function prepareBranchMutationAfterFlush(
  input: Pick<
    PrepareBranchMutationInput,
    "current" | "sourceSession" | "notices"
  > & {
    readonly stored: BranchMutationStoredIndex | null;
  },
): MapLibraryOperationResult | PreparedBranchMutation {
  const { current, sourceSession, notices, stored } = input;

  if (!isActiveBranchMoveSource(current, sourceSession)) {
    return failedOperation(notices.rejected);
  }
  const resolved = resolveBranchMutationStoredIndex(
    stored,
    sourceSession.mapId,
    notices.rejected,
  );
  if (!("index" in resolved)) {
    return resolved;
  }
  return { current, stored: resolved };
}

// flush 後にストレージ上のインデックスを読み直し、枝の移動・切り出しで共通の前提をそろえる。
export function prepareBranchMutation(
  input: PrepareBranchMutationInput,
): MapLibraryOperationResult | PreparedBranchMutation {
  const preFlushFailure = rejectBranchMutationBeforeFlush(input);
  if (preFlushFailure !== null) {
    return preFlushFailure;
  }
  const { current, sourceSession, notices, readStoredIndex } = input;
  if (!isActiveBranchMoveSource(current, sourceSession)) {
    return failedOperation(notices.rejected);
  }
  const stored = (readStoredIndex ?? readBranchMoveIndex)(current.storage);
  return prepareBranchMutationAfterFlush({
    current,
    sourceSession,
    notices,
    stored,
  });
}

export type BranchStorageOpFailure = {
  readonly ok: false;
  readonly error: string;
  readonly recoveryRequired: boolean;
  readonly sourceJson: string | null;
};

export function resolveBranchStorageFailure(
  failure: BranchStorageOpFailure,
  protect: (
    sourceJson: string | null,
    notice: OperationNotice,
  ) => MapLibraryOperationResult,
): MapLibraryOperationResult {
  const notice: OperationNotice = { kind: "error", message: failure.error };
  if (!failure.recoveryRequired) return failedOperation(notice);
  return protect(failure.sourceJson, notice);
}