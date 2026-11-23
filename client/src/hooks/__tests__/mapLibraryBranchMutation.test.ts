import type { MapIndexV1 } from "@/domain/mapLibrary/mapIndex";
import { createEmptyMapLibraryMeta } from "@/domain/mapLibrary/mapLibraryMeta";
import {
  prepareBranchMutation,
  prepareBranchMutationAfterFlush,
  rejectBranchMutationBeforeFlush,
  resolveBranchMutationStoredIndex,
  resolveBranchStorageFailure,
} from "@/hooks/mapLibraryBranchMutation";
import {
  failedOperation,
  protectedModeFailure,
  type PersistentLibraryState,
} from "@/hooks/mapLibraryState";
import { createTestStorageSession } from "@/testing/createTestStorageSession";
import { createRecordingStorage } from "@/testing/mapLibraryTestStorage";

function persistentState(session = createTestStorageSession().session): PersistentLibraryState {
  const { storage } = createRecordingStorage();
  return {
    mode: "persistent",
    storage,
    index: {
      version: 1,
      currentMapId: session.mapId,
      maps: [{
        id: session.mapId,
        name: "A",
        createdAt: "2020-01-01T00:00:00.000Z",
        updatedAt: "2020-01-01T00:00:00.000Z",
      }],
      legacyCleanupPending: false,
    },
    session,
    startupNotice: null,
    trash: { status: "ok", entries: [] },
    libraryMeta: createEmptyMapLibraryMeta(),
    libraryMetaStatus: "ready",
  };
}

const notices = {
  conflict: { kind: "error" as const, message: "conflict" },
  failed: { kind: "error" as const, message: "failed" },
  rejected: { kind: "error" as const, message: "rejected" },
};

describe("rejectBranchMutationBeforeFlush", () => {
  it("flush が conflict のときは conflict 通知だけを返す", () => {
    const session = createTestStorageSession().session;
    const before = persistentState(session);
    expect(
      rejectBranchMutationBeforeFlush({
        before,
        sourceSession: session,
        flush: { status: "conflict" },
        notices,
      }),
    ).toEqual(failedOperation(notices.conflict));
  });

  it("条件を満たすときは null を返す", () => {
    const session = createTestStorageSession().session;
    const before = persistentState(session);
    expect(
      rejectBranchMutationBeforeFlush({
        before,
        sourceSession: session,
        flush: { status: "saved" },
        notices,
      }),
    ).toBeNull();
  });
});

describe("resolveBranchMutationStoredIndex", () => {
  it("currentMapId が一致しないときは拒否する", () => {
    const index: MapIndexV1 = {
      version: 1,
      currentMapId: "other",
      maps: [],
      legacyCleanupPending: false,
    };
    expect(
      resolveBranchMutationStoredIndex({ index, raw: "{}" }, "expected", notices.rejected),
    ).toEqual(failedOperation(notices.rejected));
  });

  it("一致するときは stored を返す", () => {
    const index: MapIndexV1 = {
      version: 1,
      currentMapId: "m1",
      maps: [],
      legacyCleanupPending: false,
    };
    const stored = { index, raw: "{}" };
    expect(resolveBranchMutationStoredIndex(stored, "m1", notices.rejected)).toBe(stored);
  });
});

describe("prepareBranchMutationAfterFlush", () => {
  it("セッションが無効なときは拒否する", () => {
    const session = createTestStorageSession().session;
    const before = persistentState(session);
    const index = before.index;
    expect(
      prepareBranchMutationAfterFlush({
        current: null,
        sourceSession: session,
        notices,
        stored: { index, raw: "{}" },
      }),
    ).toEqual(failedOperation(notices.rejected));
  });
});

describe("prepareBranchMutation", () => {
  it("readStoredIndex で注入したインデックスを使う", () => {
    const session = createTestStorageSession().session;
    const before = persistentState(session);
    const index: MapIndexV1 = before.index;
    const readStoredIndex = jest.fn(() => ({ index, raw: "{}" }));
    const outcome = prepareBranchMutation({
      before,
      current: before,
      sourceSession: session,
      flush: { status: "saved" },
      notices,
      readStoredIndex,
    });
    expect(readStoredIndex).toHaveBeenCalledWith(before.storage);
    expect(outcome).toEqual({ current: before, stored: { index, raw: "{}" } });
  });
});

describe("resolveBranchStorageFailure", () => {
  it("recovery が不要なときは保護モードへ移らない", () => {
    const protect = jest.fn();
    const outcome = resolveBranchStorageFailure(
      { ok: false, error: "e", recoveryRequired: false, sourceJson: null },
      protect,
    );
    expect(outcome).toEqual(failedOperation({ kind: "error", message: "e" }));
    expect(protect).not.toHaveBeenCalled();
  });

  it("recovery が必要なときは protect の結果を返す", () => {
    const protect = jest.fn((_, notice) => protectedModeFailure(notice));
    const outcome = resolveBranchStorageFailure(
      { ok: false, error: "e", recoveryRequired: true, sourceJson: "{}" },
      protect,
    );
    expect(protect).toHaveBeenCalledWith("{}", { kind: "error", message: "e" });
    expect(outcome).toMatchObject({ ok: false, enteredProtectedMode: true });
  });
});